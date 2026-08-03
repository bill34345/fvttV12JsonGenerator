#!/usr/bin/env python3
"""Run a local PaddleOCR installation and emit normalized JSON boxes."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def make_ocr(language: str):
    # Paddle's Windows oneDNN path can fail on some CPU instruction sets with
    # newer PP-OCR models. Keep the subprocess deterministic and CPU-safe.
    os.environ.setdefault("FLAGS_use_onednn", "0")
    os.environ.setdefault("FLAGS_use_mkldnn", "0")
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    from paddleocr import PaddleOCR

    lang = "ch" if language in {"zh-CN", "mixed", "auto"} else "en"
    attempts = [
        # PP-OCRv5 is materially better for the mixed Chinese/English stat
        # block input used by this project, while the later attempts keep the
        # adapter usable with older PaddleOCR releases.
        {"lang": lang, "ocr_version": "PP-OCRv5", "use_doc_orientation_classify": False, "use_doc_unwarping": False, "use_textline_orientation": False},
        {"lang": lang, "use_angle_cls": True},
        {"lang": lang},
    ]
    last = None
    for kwargs in attempts:
        try:
            return PaddleOCR(**kwargs)
        except TypeError as error:
            last = error
    raise last or RuntimeError("Unable to initialize PaddleOCR")


def point_box(points):
    xs = [float(point[0]) for point in points]
    ys = [float(point[1]) for point in points]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


def parse_old_result(result):
    words = []
    for page in result or []:
        for line in page or []:
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue
            points, value = line[0], line[1]
            if not isinstance(value, (list, tuple)) or len(value) < 2:
                continue
            text, confidence = str(value[0]), float(value[1])
            words.append({"text": text, "box": point_box(points), "confidence": confidence})
    return words


def parse_predict_result(result):
    # PaddleOCR 3.x returns Result objects with a json representation. Keep the
    # adapter permissive so the application does not depend on one minor API.
    if isinstance(result, (list, tuple)):
        words = []
        for item in result:
            words.extend(parse_predict_result(item))
        return words
    if hasattr(result, "json"):
        payload = result.json
        payload = payload() if callable(payload) else payload
        if isinstance(payload, str):
            payload = json.loads(payload)
    else:
        payload = result
    if isinstance(payload, dict) and isinstance(payload.get("res"), dict):
        payload = payload["res"]
    if isinstance(payload, dict):
        payload = [payload]
    words = []
    for page in payload or []:
        if not isinstance(page, dict):
            continue
        texts = page.get("rec_texts") or page.get("texts") or []
        scores = page.get("rec_scores") or page.get("scores") or []
        boxes = page.get("dt_polys") or page.get("rec_polys") or page.get("boxes") or []
        for index, text in enumerate(texts):
            if index >= len(boxes):
                continue
            confidence = float(scores[index]) if index < len(scores) else 0.0
            words.append({"text": str(text), "box": point_box(boxes[index]), "confidence": confidence})
    return words


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: paddleocr_extract.py INPUT language", file=sys.stderr)
        return 2
    try:
        ocr = make_ocr(sys.argv[2])
        path = sys.argv[1]
        if hasattr(ocr, "predict"):
            words = parse_predict_result(list(ocr.predict(path)))
        else:
            words = parse_old_result(ocr.ocr(path, cls=True))
    except Exception as error:  # noqa: BLE001 - message is surfaced by doctor/workflow
        print(f"PaddleOCR failed: {error}", file=sys.stderr)
        return 3

    width = max((word["box"]["x"] + word["box"]["width"] for word in words), default=0.0)
    height = max((word["box"]["y"] + word["box"]["height"] for word in words), default=0.0)
    text = "\n".join(word["text"] for word in words)
    json.dump(
        {
            "schemaVersion": 1,
            "sourcePath": str(Path(sys.argv[1]).resolve()),
            "fileName": Path(sys.argv[1]).name,
            "kind": "image",
            "pageCount": 1,
            "pages": [{
                "pageNumber": 1,
                "width": width,
                "height": height,
                "blocks": [{
                    "id": "p1-block1",
                    "pageNumber": 1,
                    "text": text,
                    "boxes": [word["box"] for word in words],
                    "words": words,
                    "method": "paddleocr",
                    "confidence": sum(word["confidence"] for word in words) / len(words) if words else 0.0,
                    "language": sys.argv[2] if sys.argv[2] != "auto" else "mixed",
                }],
                "method": "paddleocr",
                "confidence": sum(word["confidence"] for word in words) / len(words) if words else 0.0,
                "warnings": [],
            }],
            "blocks": [],
            "warnings": [],
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

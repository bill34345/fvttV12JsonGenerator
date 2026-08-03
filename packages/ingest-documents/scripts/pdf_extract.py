#!/usr/bin/env python3
"""Emit coordinate-aware PDF text as JSON for the TypeScript document workflow."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def line_groups(words: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for word in sorted(words, key=lambda item: (float(item.get("top", 0)), float(item.get("x0", 0)))):
        top = float(word.get("top", 0))
        height = float(word.get("height", 0)) or 10.0
        selected = next(
            (group for group in groups if abs(top - group["top"]) <= max(3.0, min(height, group["height"]) * 0.5)),
            None,
        )
        if selected is None:
            selected = {"top": top, "height": height, "words": []}
            groups.append(selected)
        selected["words"].append(word)

    lines: list[dict] = []
    for group in sorted(groups, key=lambda item: item["top"]):
        ordered = sorted(group["words"], key=lambda item: float(item.get("x0", 0)))
        text = ""
        previous = None
        for word in ordered:
            value = str(word.get("text", "")).strip()
            if not value:
                continue
            if previous is not None:
                gap = float(word.get("x0", 0)) - float(previous.get("x1", previous.get("x0", 0)))
                threshold = max(1.0, min(float(word.get("height", 10)), float(previous.get("height", 10))) * 0.22)
                if gap > threshold:
                    text += " "
            text += value
            previous = word
        if text.strip():
            boxes = [
                {
                    "x": float(word.get("x0", 0)),
                    "y": float(word.get("top", 0)),
                    "width": max(0.0, float(word.get("x1", 0)) - float(word.get("x0", 0))),
                    "height": max(0.0, float(word.get("bottom", 0)) - float(word.get("top", 0))),
                }
                for word in ordered
            ]
            lines.append({"text": text.strip(), "top": group["top"], "boxes": boxes})
    return lines


def signal_count(text: str) -> int:
    checks = [
        r"\b(?:AC|Armor Class)\b",
        r"\b(?:HP|Hit Points)\b",
        r"\bSpeed\b",
        r"\b(?:CR|Challenge)\b",
        r"\b(?:STR|DEX|CON|INT|WIS|CHA)\b",
        r"\b(?:Actions|Traits|Reactions|Legendary Actions|Mythic Actions)\b",
    ]
    return sum(bool(re.search(pattern, text, re.IGNORECASE)) for pattern in checks)


def has_stat_core(text: str) -> bool:
    checks = [
        r"\b(?:AC|Armor Class)\b",
        r"\b(?:HP|Hit Points)\b",
        r"\bSpeed\b",
        r"\b(?:CR|Challenge)\b",
        r"MOD\s+SAVE",
    ]
    return all(re.search(pattern, text, re.IGNORECASE) for pattern in checks)


def block_from_words(page_number: int, block_number: int, method: str, words: list[dict], width: float, height: float) -> dict:
    return block_from_lines(page_number, block_number, method, line_groups(words), width, height)


def block_from_lines(page_number: int, block_number: int, method: str, lines: list[dict], width: float, height: float) -> dict:
    text = "\n".join(reflow_mechanical_lines([line["text"] for line in lines]))
    boxes = [box for line in lines for box in line["boxes"]]
    if boxes:
        x = min(box["x"] for box in boxes)
        y = min(box["y"] for box in boxes)
        x2 = max(box["x"] + box["width"] for box in boxes)
        y2 = max(box["y"] + box["height"] for box in boxes)
        bbox = {"x": x, "y": y, "width": x2 - x, "height": y2 - y}
    else:
        bbox = {"x": 0, "y": 0, "width": width, "height": height}
    return {
        "id": f"p{page_number}-block{block_number}",
        "pageNumber": page_number,
        "text": text,
        "boxes": boxes,
        "method": method,
        "confidence": 1.0,
        "language": "en",
        "bbox": bbox,
    }


def reflow_mechanical_lines(lines: list[str]) -> list[str]:
    """Join PDF line wraps that would otherwise split dice and modifiers."""
    result: list[str] = []
    for line in lines:
        value = line.strip()
        if not value:
            continue
        previous = result[-1] if result else ""
        joins_dice = bool(re.search(r"\d+d\d+", previous, re.IGNORECASE) and re.match(r"^[+\-−]\s*\d", value))
        joins_closing = bool(re.match(r"^[\)\]\},.;:!?]", value) and previous)
        if joins_dice or joins_closing:
            result[-1] = f"{previous} {value}"
        else:
            result.append(value)
    return result


def extract_page(page, page_number: int) -> dict:
    width = float(page.width)
    height = float(page.height)
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False) or []
    if not words:
        return {
            "pageNumber": page_number,
            "width": width,
            "height": height,
            "blocks": [],
            "method": "empty",
            "confidence": 0.0,
            "warnings": ["PDF page contains no extractable text."],
        }

    left = [word for word in words if (float(word.get("x0", 0)) + float(word.get("x1", 0))) / 2 < width * 0.5]
    right = [word for word in words if word not in left]
    left_text = "\n".join(line["text"] for line in line_groups(left))
    right_text = "\n".join(line["text"] for line in line_groups(right))

    # Split only when both columns independently look like stat blocks. A wide
    # stat block such as Beholder Hivemother uses the right column for actions,
    # so treating it as two creatures would be incorrect.
    if has_stat_core(left_text) and has_stat_core(right_text):
        blocks = [
            block_from_words(page_number, 1, "native-pdf-text", left, width, height),
            block_from_words(page_number, 2, "native-pdf-text", right, width, height),
        ]
    else:
        header = [word for word in words if float(word.get("top", 0)) < 68]
        left_body = [word for word in left if float(word.get("top", 0)) >= 68]
        right_body = [word for word in right if float(word.get("top", 0)) >= 68]
        # Rebuild the page as header, complete left column, then complete right
        # column. Sorting all words by y again would silently interleave the two
        # columns and split eye-ray/action sections.
        ordered_lines = line_groups(header) + line_groups(left_body) + line_groups(right_body)
        blocks = [block_from_lines(page_number, 1, "native-pdf-text", ordered_lines, width, height)]

    return {
        "pageNumber": page_number,
        "width": width,
        "height": height,
        "blocks": blocks,
        "method": "native-pdf-text",
        "confidence": 1.0,
        "warnings": [],
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: pdf_extract.py INPUT.pdf", file=sys.stderr)
        return 2
    input_path = Path(sys.argv[1])
    with pdfplumber.open(str(input_path)) as pdf:
        pages = [extract_page(page, index) for index, page in enumerate(pdf.pages, start=1)]
    blocks = [block for page in pages for block in page["blocks"]]
    json.dump(
        {
            "schemaVersion": 1,
            "sourcePath": str(input_path.resolve()),
            "fileName": input_path.name,
            "kind": "pdf",
            "pageCount": len(pages),
            "pages": pages,
            "blocks": blocks,
            "warnings": [],
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

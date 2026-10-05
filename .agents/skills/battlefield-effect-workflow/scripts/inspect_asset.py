"""Read-only raster checks. Mechanical validity never establishes visual acceptance."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


def inspect(path, require_transparent=False, expected_sha256=None):
    payload = path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    errors = []
    with Image.open(path) as im:
        im.load()
        width, height = im.size
        report = {
            "file": str(path.resolve()),
            "format": im.format,
            "mode": im.mode,
            "size": [width, height],
            "bytes": len(payload),
            "sha256": digest,
        }
        has_alpha = "A" in im.getbands() or "transparency" in im.info
        report["has_alpha"] = has_alpha
        if has_alpha:
            alpha = im.convert("RGBA").getchannel("A")
            hist = alpha.histogram()
            pixels = width * height
            border = [
                alpha.crop((0, 0, width, 1)), alpha.crop((0, height - 1, width, height)),
                alpha.crop((0, 0, 1, height)), alpha.crop((width - 1, 0, width, height)),
            ]
            report["alpha"] = {
                "range": list(alpha.getextrema()),
                "fully_clear_fraction": hist[0] / pixels,
                "coverage_fraction": sum(value * count for value, count in enumerate(hist)) / (255 * pixels),
                "border_max": max(edge.getextrema()[1] for edge in border),
            }
            if require_transparent and (not hist[0] or sum(hist[1:]) == 0):
                errors.append("Expected both transparent ground and visible artwork")
        elif require_transparent:
            errors.append("Missing transparency channel")
    if expected_sha256 and digest.lower() != expected_sha256.lower():
        errors.append("Source SHA-256 mismatch")
    report["errors"] = errors
    report["mechanical_pass"] = not errors
    report["visual_acceptance"] = "NOT_EVALUATED"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--require-transparent", action="store_true")
    parser.add_argument("--expected-sha256")
    args = parser.parse_args()
    try:
        result = inspect(args.image, args.require_transparent, args.expected_sha256)
    except (OSError, ValueError) as error:
        print(json.dumps({"mechanical_pass": False, "errors": [str(error)],
                          "visual_acceptance": "NOT_EVALUATED"}, ensure_ascii=False))
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["mechanical_pass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())

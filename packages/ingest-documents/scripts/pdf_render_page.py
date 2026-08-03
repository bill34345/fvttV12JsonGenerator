#!/usr/bin/env python3
"""Render one PDF page to a PNG using pdfplumber's local PDFium adapter."""

from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: pdf_render_page.py INPUT page-number OUTPUT", file=sys.stderr)
        return 2
    try:
        import pdfplumber

        input_path = Path(sys.argv[1])
        page_number = int(sys.argv[2])
        output_path = Path(sys.argv[3])
        with pdfplumber.open(str(input_path)) as pdf:
            if page_number < 1 or page_number > len(pdf.pages):
                raise ValueError(f"page {page_number} is outside 1..{len(pdf.pages)}")
            image = pdf.pages[page_number - 1].to_image(resolution=200, antialias=True)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            image.original.save(str(output_path), format="PNG")
    except Exception as error:  # noqa: BLE001 - surfaced by the workflow
        print(f"PDF page rendering failed: {error}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

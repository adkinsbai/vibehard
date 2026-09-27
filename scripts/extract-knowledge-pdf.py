"""Read-only PDF text extraction for the small local knowledge proof batch.

This does not OCR images or infer electrical connections in schematic drawings.
"""

import json
import sys

import pdfplumber


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: extract-knowledge-pdf.py <pdf>")
    with pdfplumber.open(sys.argv[1]) as pdf:
        if len(pdf.pages) > 300:
            raise SystemExit("too many pages for proof batch")
        pages = []
        total_chars = 0
        for number, page in enumerate(pdf.pages, 1):
            content = page.extract_text() or ""
            total_chars += len(content)
            if total_chars > 2_000_000:
                raise SystemExit("extracted text exceeds proof-batch limit")
            pages.append({"page": number, "text": content})
        json.dump(pages, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()

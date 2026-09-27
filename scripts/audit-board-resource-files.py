"""Read-only, per-reference local/original metadata audit for the board UI.

This checks exact bytes against the private OSS batch's already-published
metadata snapshot. It does not promote source files to approved specifications.
Run with the bundled workspace Python (pypdf installed):

  python scripts/audit-board-resource-files.py /path/to/ESP32-S3资料包 /path/to/output.json
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

from pypdf import PdfReader


REPO = Path(__file__).resolve().parent.parent
BOARD_MODEL = re.compile(r"ESP32[-_]S3[-_][A-Za-z0-9_.-]+", re.IGNORECASE)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def signature(path: Path) -> str:
    with path.open("rb") as stream:
        lead = stream.read(8)
    if lead.startswith(b"%PDF-"):
        return "pdf"
    if lead.startswith(b"PK\x03\x04"):
        return "zip"
    if lead.startswith(b"Rar!\x1a\x07"):
        return "rar"
    if lead.startswith(b"7z\xbc\xaf\x27\x1c"):
        return "7z"
    return "other"


def normalized(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def filename_review(board: str, section: str, basename: str) -> str:
    if "硬件资料" not in section:
        return "not_board_specific"
    model = BOARD_MODEL.search(basename)
    if not model:
        return "manual_title_check"
    normalized_board = normalized(board)
    normalized_file = normalized(model.group())
    if normalized_board in normalized_file or normalized_file in normalized_board:
        return "name_matches"
    if normalized_file in {"ESP32S3", "ESP32S3A", "ESP32S3EPAPERDRIVERBOARD"}:
        return "family_document_review"
    return "variant_or_other_board_review"


def pdf_metadata(path: Path) -> dict:
    reader = PdfReader(str(path), strict=False)
    page = reader.pages[0] if reader.pages else None
    first_text = (page.extract_text() or "")[:12000] if page else ""
    return {
        "pageCount": len(reader.pages),
        "firstPageModels": sorted(set(match.group().rstrip("._-") for match in BOARD_MODEL.finditer(first_text)))[:20],
        "pdfTitle": str(reader.metadata.title)[:200] if reader.metadata and reader.metadata.title else None,
    }


def zip_metadata(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        return {
            "entryCount": len(entries),
            "firstBoardNamedEntries": [entry.filename[:180] for entry in entries
                                       if BOARD_MODEL.search(entry.filename)][:15],
            "encryptedEntries": sum(bool(entry.flag_bits & 1) for entry in entries),
        }


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: audit-board-resource-files.py <source-root> <output-json>")
    source_root = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    if not source_root.is_dir():
        raise SystemExit(f"Source directory missing: {source_root}")
    catalog = json.loads((REPO / "lib/server/data/board-catalog.json").read_text())
    evidence = json.loads((REPO / "lib/server/data/board-catalog-evidence.json").read_text())
    visible_boards = [board for board in catalog if any(resource["path"] in evidence["resources"]
                                                        for resource in board["resources"])]
    rows = []
    for board in visible_boards:
        for resource in board["resources"]:
            relative = resource["path"]
            proof = evidence["resources"].get(relative)
            if not proof:
                continue
            path = source_root / relative
            row = {
                "board": board["name"], "section": resource["section"],
                "label": resource["name"], "relativePath": relative,
                "expectedSha256": proof["sha256"], "expectedBytes": proof["bytes"],
                "indexStatus": proof["status"],
                "filenameReview": filename_review(board["name"], resource["section"], path.name),
                "fileExists": path.is_file(),
            }
            if path.is_file():
                row["actualBytes"] = path.stat().st_size
                row["actualSha256"] = sha256_file(path)
                row["exactBytesMatch"] = (row["actualBytes"] == proof["bytes"]
                                          and row["actualSha256"] == proof["sha256"])
                row["signature"] = signature(path)
                try:
                    if row["signature"] == "pdf":
                        row.update(pdf_metadata(path))
                    elif row["signature"] == "zip":
                        row.update(zip_metadata(path))
                except Exception as error:
                    row["metadataError"] = f"{type(error).__name__}: {str(error)[:180]}"
            rows.append(row)
            if len(rows) % 50 == 0:
                print(f"audited {len(rows)}/{evidence['counts']['visibleReferences']}", flush=True)

    if len(rows) != evidence["counts"]["visibleReferences"]:
        raise SystemExit("Reference count mismatch")
    stats = {
        "references": len(rows),
        "missingLocal": sum(not row["fileExists"] for row in rows),
        "differentBytes": sum(row["fileExists"] and not row["exactBytesMatch"] for row in rows),
        "signatures": dict(Counter(row.get("signature", "missing") for row in rows)),
        "filenameReview": dict(Counter(row["filenameReview"] for row in rows)),
        "metadataErrors": sum(bool(row.get("metadataError")) for row in rows),
    }
    output_path.write_text(json.dumps({"schema": "vibehard-board-resource-audit/v1",
                                       "sourceBatchSha256": evidence["rawManifestSha256"],
                                       "stats": stats, "references": rows}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(stats, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from common import (
    INTERIM_DIR,
    detect_symptom_keywords,
    ensure_dirs,
    load_source_registry,
    merge_safety_tags,
    normalize_text,
    read_jsonl,
    stable_hash,
    write_jsonl,
)
from config import DEFAULT_NORMALIZED_DOCS

EXCLUDE_PATTERNS = [
    "rag_documents.normalized",
    "rag_chunks",
    "embedded",
    "errors",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize collected/interim documents for RAG chunking.")
    parser.add_argument(
        "--input",
        action="append",
        help="Input JSONL path. Repeatable. Defaults to all data/interim/*.jsonl except generated files.",
    )
    parser.add_argument("--output", default=str(DEFAULT_NORMALIZED_DOCS))
    parser.add_argument("--min-chars", type=int, default=120)
    return parser.parse_args()


def default_inputs() -> list[Path]:
    paths = []
    for path in INTERIM_DIR.glob("*.jsonl"):
        if any(pattern in path.name for pattern in EXCLUDE_PATTERNS):
            continue
        paths.append(path)
    return sorted(paths)


def normalize_doc(row: dict[str, Any], registry: dict[str, dict[str, Any]]) -> dict[str, Any]:
    raw_source_id = row.get("source_id")
    source_key = row.get("source_key") or raw_source_id
    source = registry.get(source_key) or registry.get(raw_source_id) or {}
    source_key = source.get("source_key") or source_key
    source_id = source.get("source_uuid") or raw_source_id
    text = normalize_text(str(row.get("text") or row.get("content") or row.get("body") or ""))
    symptom_keywords = row.get("symptom_keywords") or detect_symptom_keywords(text)

    category = row.get("category") or source.get("category") or "uncategorized"
    safety_tags = merge_safety_tags(source.get("safety_tags"), row.get("safety_tags"))

    doc_id = row.get("doc_id") or f"{source_id or 'unknown'}:{stable_hash(text)}"
    return {
        "doc_id": doc_id,
        "source_id": source_id,
        "source_key": source_key,
        "title": row.get("title") or source.get("title") or doc_id,
        "publisher": row.get("publisher") or source.get("publisher") or "",
        "url": row.get("url") or row.get("source_url") or source.get("url") or "",
        "license": row.get("license") or source.get("license") or "verify_required",
        "collected_at": row.get("collected_at") or "",
        "category": category,
        "priority": row.get("priority") or source.get("priority") or 99,
        "usage_scope": row.get("usage_scope") or source.get("usage_scope") or "rag",
        "crop_or_plant": row.get("crop_or_plant") or row.get("target_crops") or [],
        "symptom_keywords": symptom_keywords,
        "safety_tags": safety_tags,
        "text": text,
    }


def main() -> None:
    args = parse_args()
    ensure_dirs()
    inputs = [Path(path) for path in args.input] if args.input else default_inputs()
    registry = load_source_registry()

    normalized: list[dict[str, Any]] = []
    seen_doc_ids: set[str] = set()
    skipped = 0

    for path in inputs:
        for row in read_jsonl(path):
            doc = normalize_doc(row, registry)
            if len(doc["text"]) < args.min_chars:
                skipped += 1
                continue
            if doc["doc_id"] in seen_doc_ids:
                skipped += 1
                continue
            seen_doc_ids.add(doc["doc_id"])
            normalized.append(doc)

    count = write_jsonl(Path(args.output), normalized)
    print(f"Normalized {count} documents to {args.output}. Skipped {skipped}.")


if __name__ == "__main__":
    main()

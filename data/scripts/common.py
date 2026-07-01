from __future__ import annotations

import csv
import hashlib
import html
import json
import os
import re
import unicodedata
import uuid
from datetime import UTC, datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
CATALOG_DIR = DATA_DIR / "catalog"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"
VECTORSTORE_DIR = DATA_DIR / "vectorstore"

DEFAULT_HEADERS = {
    "User-Agent": "FarmhaniDataPipeline/0.1 (+https://github.com/SKNETWORKS-FAMILY-AICAMP/SKN30-3rd-3Team)"
}
SOURCE_UUID_NAMESPACE = uuid.UUID("4a8ecf91-111c-4f56-a965-f3f3f0d9d9b1")
CHUNK_UUID_NAMESPACE = uuid.UUID("70d3a994-55e0-4e58-8477-f128e1cbf65f")


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
        if tag in {"p", "div", "section", "article", "li", "br", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth:
            self._skip_depth -= 1
        if tag in {"p", "div", "section", "article", "li", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        return normalize_text(" ".join(self.parts))


def now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def today() -> str:
    return datetime.now(UTC).date().isoformat()


def ensure_dirs() -> None:
    for directory in [RAW_DIR, INTERIM_DIR, PROCESSED_DIR, VECTORSTORE_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def load_env() -> dict[str, str]:
    env: dict[str, str] = dict(os.environ)
    for path in [REPO_ROOT / ".env", DATA_DIR / ".env"]:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no} invalid JSONL: {exc}") from exc
    return rows


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            count += 1
    return count


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fieldnames: list[str]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})
            count += 1
    return count


def normalize_text(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    return value.strip()


def html_to_text(raw_html: str) -> str:
    parser = TextExtractor()
    parser.feed(raw_html)
    return parser.text()


def stable_hash(value: str, length: int = 16) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def uuid_for_source_key(source_key: str) -> str:
    return str(uuid.uuid5(SOURCE_UUID_NAMESPACE, source_key))


def uuid_for_chunk_key(chunk_key: str) -> str:
    return str(uuid.uuid5(CHUNK_UUID_NAMESPACE, chunk_key))


def is_uuid(value: Any) -> bool:
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def slugify(value: str, fallback_prefix: str = "item") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_value).strip("_")
    if not slug:
        slug = f"{fallback_prefix}_{stable_hash(value, 10)}"
    return slug


def http_get_text(url: str, params: dict[str, Any] | None = None, timeout: int = 30) -> str:
    full_url = url
    if params:
        full_url = f"{url}?{urlencode({k: v for k, v in params.items() if v is not None})}"
    request = Request(full_url, headers=DEFAULT_HEADERS)
    try:
        with urlopen(request, timeout=timeout) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except HTTPError as exc:
        raise RuntimeError(f"GET {full_url} failed with HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"GET {full_url} failed: {exc.reason}") from exc


def chunk_text(text: str, max_chars: int = 2200, overlap_chars: int = 250) -> list[str]:
    text = normalize_text(text)
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            sentence_end = max(text.rfind(".", start, end), text.rfind("\n", start, end))
            if sentence_end > start + int(max_chars * 0.45):
                end = sentence_end + 1
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(0, end - overlap_chars)
    return [chunk for chunk in chunks if chunk]


def load_source_registry() -> dict[str, dict[str, Any]]:
    registry = read_json(CATALOG_DIR / "source_registry.json")
    sources = {}
    for source in registry["sources"]:
        source_key = source.get("source_key") or source["source_id"]
        source_uuid = source.get("source_uuid") or uuid_for_source_key(source_key)
        enriched = {
            **source,
            "source_key": source_key,
            "source_uuid": source_uuid,
        }
        sources[source_key] = enriched
        sources[source_uuid] = enriched
    return sources


def load_taxonomy() -> dict[str, Any]:
    return read_json(CATALOG_DIR / "category_taxonomy.json")


def merge_safety_tags(*tag_lists: Iterable[str] | None) -> list[str]:
    tags: list[str] = []
    for tag_list in tag_lists:
        if not tag_list:
            continue
        for tag in tag_list:
            if tag and tag not in tags:
                tags.append(tag)
    if "not_diagnosis" not in tags:
        tags.insert(0, "not_diagnosis")
    return tags


def detect_symptom_keywords(text: str) -> list[str]:
    taxonomy = load_taxonomy()
    matched: list[str] = []
    lowered = text.lower()
    for group, keywords in taxonomy.get("symptom_keywords", {}).items():
        if any(keyword.lower() in lowered for keyword in keywords):
            matched.append(group)
    return matched

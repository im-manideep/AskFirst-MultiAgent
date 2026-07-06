"""KB ingest + BM25 retrieval over the Northwind Desk PDFs.

Five small documents — BM25 over paragraph chunks is plenty; no vector DB.
Chunks carry source file + page so the resolver can cite policy.
"""

import re
from pathlib import Path

from pypdf import PdfReader
from rank_bm25 import BM25Okapi

from backend import config

CHUNK_CHARS = 500


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9$]+", text.lower())


def _chunk_page(text: str) -> list[str]:
    """Group a page's lines into ~CHUNK_CHARS chunks, keeping headings attached."""
    chunks: list[str] = []
    current = ""
    for line in (ln.strip() for ln in text.splitlines()):
        if not line:
            continue
        if current and len(current) + len(line) > CHUNK_CHARS:
            chunks.append(current)
            current = line
        else:
            current = f"{current} {line}".strip()
    if current:
        chunks.append(current)
    return chunks


class KnowledgeBase:
    def __init__(self, kb_dir: Path):
        self.chunks: list[dict] = []
        for pdf in sorted(kb_dir.glob("*.pdf")):
            reader = PdfReader(str(pdf))
            for page_no, page in enumerate(reader.pages, start=1):
                for text in _chunk_page(page.extract_text() or ""):
                    self.chunks.append({"text": text, "source": pdf.name, "page": page_no})
        if not self.chunks:
            raise RuntimeError(
                f"No KB chunks found in {kb_dir} — run: uv run python -m backend.scripts.generate_kb"
            )
        self._bm25 = BM25Okapi([_tokenize(c["text"]) for c in self.chunks])

    def search(self, query: str, k: int = 5) -> list[dict]:
        scores = self._bm25.get_scores(_tokenize(query))
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        return [
            {**self.chunks[i], "score": round(float(scores[i]), 3)}
            for i in ranked[:k]
            if scores[i] > 0
        ]


_kb: KnowledgeBase | None = None


def get_kb() -> KnowledgeBase:
    global _kb
    if _kb is None:
        _kb = KnowledgeBase(config.KB_DIR)
    return _kb

"""
Embedding generation with provider dispatch.

Supports:
- sentence-transformers (default, local, no server needed)
- ollama (requires running Ollama server)

Based on: "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks" (Reimers & Gurevych, 2019)
"""

import os
import requests
from typing import List, Optional
from dataclasses import dataclass

from forge.config import config

# Default models per provider
_DEFAULT_MODELS = {
    "sentence-transformers": "all-MiniLM-L6-v2",
    "ollama": "nomic-embed-text",
}


@dataclass
class EmbeddingResult:
    """Result of embedding generation."""
    text: str
    vector: List[float]
    model: str


class Embedder:
    """
    Generate embeddings using configurable providers.

    Providers:
    - sentence-transformers: Local model via sentence-transformers library (default)
    - ollama: Remote model via Ollama embedding API

    Reference:
        Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings
        using Siamese BERT-Networks. arXiv:1908.10084
    """

    def __init__(self, model: Optional[str] = None, base_url: Optional[str] = None,
                 provider: Optional[str] = None):
        self.provider = provider or config.embedding_provider

        # Use provider-appropriate default model unless user explicitly set FORGE_EMBED_MODEL
        user_set_model = os.getenv("FORGE_EMBED_MODEL")
        if model:
            self.model = model
        elif user_set_model:
            self.model = user_set_model
        else:
            self.model = _DEFAULT_MODELS.get(self.provider, config.embedding_model)

        self.base_url = base_url or config.ollama_url
        self._dimension: Optional[int] = None
        self._st_model = None  # Lazy-loaded sentence-transformers model

    # ── Public API ──────────────────────────────────────────────

    def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
        if self.provider == "sentence-transformers":
            return self._embed_st(text)
        return self._embed_ollama(text)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        if self.provider == "sentence-transformers":
            return self._embed_batch_st(texts)
        return [self._embed_ollama(text) for text in texts]

    @property
    def dimension(self) -> int:
        """Get embedding dimension (lazily determined)."""
        if self._dimension is None:
            test = self.embed("test")
            self._dimension = len(test) if test else 384
        return self._dimension

    def check_connection(self) -> bool:
        """Check if embedding provider is available."""
        if self.provider == "sentence-transformers":
            return self._check_connection_st()
        return self._check_connection_ollama()

    # ── sentence-transformers provider ──────────────────────────

    def _get_st_model(self):
        """Lazy-load SentenceTransformer model on first use."""
        if self._st_model is None:
            from sentence_transformers import SentenceTransformer
            self._st_model = SentenceTransformer(self.model)
        return self._st_model

    def _embed_st(self, text: str) -> List[float]:
        """Generate embedding via sentence-transformers."""
        try:
            model = self._get_st_model()
            vector = model.encode(text).tolist()
            if self._dimension is None and vector:
                self._dimension = len(vector)
            return vector
        except Exception as e:
            print(f"⚠️  Embedding error (sentence-transformers, model={self.model}): {e}")
            return []

    def _embed_batch_st(self, texts: List[str]) -> List[List[float]]:
        """Batch embed via sentence-transformers (native batch, much faster)."""
        try:
            model = self._get_st_model()
            vectors = model.encode(texts).tolist()
            if self._dimension is None and vectors and vectors[0]:
                self._dimension = len(vectors[0])
            return vectors
        except Exception as e:
            print(f"⚠️  Batch embedding error (sentence-transformers): {e}")
            return [[] for _ in texts]

    def _check_connection_st(self) -> bool:
        """Check if sentence-transformers is loadable."""
        try:
            self._get_st_model()
            return True
        except Exception:
            return False

    # ── Ollama provider ─────────────────────────────────────────

    def _embed_ollama(self, text: str) -> List[float]:
        """Generate embedding via Ollama API."""
        try:
            response = requests.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": text},
                timeout=30,
            )
            response.raise_for_status()
            vector = response.json().get("embedding", [])

            if self._dimension is None and vector:
                self._dimension = len(vector)

            return vector
        except Exception as e:
            print(f"⚠️  Embedding error (is Ollama running at {self.base_url}?): {e}")
            return []

    def _check_connection_ollama(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except Exception:
            return False

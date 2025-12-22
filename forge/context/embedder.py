"""
Embedding generation using Ollama.

Uses dense vector embeddings for semantic search.
Based on: "Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks" (Reimers & Gurevych, 2019)
"""

import requests
from typing import List, Optional
from dataclasses import dataclass

from forge.config import config


@dataclass
class EmbeddingResult:
    """Result of embedding generation."""
    text: str
    vector: List[float]
    model: str


class Embedder:
    """
    Generate embeddings using Ollama's embedding API.
    
    Embeddings map text to dense vectors in a high-dimensional space
    where semantically similar texts are close together.
    
    Reference:
        Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings 
        using Siamese BERT-Networks. arXiv:1908.10084
    """
    
    def __init__(self, model: Optional[str] = None, base_url: Optional[str] = None):
        self.model = model or config.embedding_model
        self.base_url = base_url or config.ollama_url
        self._dimension: Optional[int] = None
    
    def embed(self, text: str) -> List[float]:
        """Generate embedding for a single text."""
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
            print(f"Embedding error: {e}")
            return []
    
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts."""
        return [self.embed(text) for text in texts]
    
    @property
    def dimension(self) -> int:
        """Get embedding dimension (lazily determined)."""
        if self._dimension is None:
            test = self.embed("test")
            self._dimension = len(test) if test else 768
        return self._dimension
    
    def check_connection(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False


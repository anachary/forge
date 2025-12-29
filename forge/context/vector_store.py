"""
Vector store using LanceDB for persistent semantic search.

LanceDB provides embedded vector database with disk persistence.
Based on: "Approximate Nearest Neighbors" (Arya et al., 1998)
"""

from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

try:
    import lancedb
    import numpy as np
    HAS_LANCEDB = True
except ImportError:
    HAS_LANCEDB = False

from .chunker import CodeChunk


@dataclass  
class SearchResult:
    """Result from vector search."""
    content: str
    file_path: str
    start_line: int
    end_line: int
    score: float
    symbol_name: Optional[str] = None


class VectorStore:
    """
    Embedded vector database for code search.
    
    Uses LanceDB for:
    - Disk persistence (survives restarts)
    - Fast approximate nearest neighbor search
    - No external server required
    
    Reference:
        Arya, S., et al. (1998). An Optimal Algorithm for Approximate Nearest 
        Neighbor Searching in Fixed Dimensions. Journal of the ACM.
    """
    
    TABLE_NAME = "code_chunks"
    
    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.mkdir(parents=True, exist_ok=True)
        
        self._db = None
        self._table = None
    
    @property
    def db(self):
        """Lazy database connection."""
        if self._db is None and HAS_LANCEDB:
            self._db = lancedb.connect(str(self.db_path))
        return self._db
    
    def add_chunks(self, chunks: List[CodeChunk], embeddings: List[List[float]]) -> int:
        """Add code chunks with their embeddings to the store."""
        if not HAS_LANCEDB:
            print("⚠️  lancedb not installed - cannot store code chunks. Run: pip install lancedb")
            return 0
        if not chunks or not embeddings:
            return 0
        
        data = []
        for chunk, embedding in zip(chunks, embeddings):
            if embedding:  # Skip empty embeddings
                data.append({
                    "vector": embedding,
                    "content": chunk.content,
                    "file_path": chunk.file_path,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "chunk_type": chunk.chunk_type,
                    "symbol_name": chunk.symbol_name or "",
                })
        
        if not data:
            return 0
        
        try:
            if self.TABLE_NAME in self.db.table_names():
                table = self.db.open_table(self.TABLE_NAME)
                table.add(data)
            else:
                self._table = self.db.create_table(self.TABLE_NAME, data)
            
            return len(data)
        except Exception as e:
            print(f"Vector store error: {e}")
            return 0
    
    def search(self, query_embedding: List[float], limit: int = 10) -> List[SearchResult]:
        """Search for similar code chunks."""
        if not HAS_LANCEDB:
            print("⚠️  lancedb not installed - cannot search. Run: pip install lancedb")
            return []
        if not query_embedding:
            print("⚠️  Empty query embedding - cannot search (check embedding provider)")
            return []
        
        try:
            if self.TABLE_NAME not in self.db.table_names():
                return []
            
            table = self.db.open_table(self.TABLE_NAME)
            results = table.search(query_embedding).limit(limit).to_list()
            
            return [
                SearchResult(
                    content=r["content"],
                    file_path=r["file_path"],
                    start_line=r["start_line"],
                    end_line=r["end_line"],
                    score=1 - r.get("_distance", 0),  # Convert distance to similarity
                    symbol_name=r.get("symbol_name"),
                )
                for r in results
            ]
        except Exception as e:
            print(f"Search error: {e}")
            return []
    
    def clear(self):
        """Clear all data from the store."""
        if HAS_LANCEDB and self.TABLE_NAME in self.db.table_names():
            self.db.drop_table(self.TABLE_NAME)
    
    def count(self) -> int:
        """Get number of chunks in store."""
        if not HAS_LANCEDB:
            return 0
        if self.TABLE_NAME not in self.db.table_names():
            return 0
        try:
            table = self.db.open_table(self.TABLE_NAME)
            return len(table)
        except:
            return 0


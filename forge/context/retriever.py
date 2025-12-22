"""
Unified context retriever - combines all context sources.

Implements Retrieval-Augmented Generation (RAG) for code.
Based on: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (Lewis et al., 2020)
"""

from pathlib import Path
from typing import List, Optional
from dataclasses import dataclass

from forge.config import config
from .embedder import Embedder
from .chunker import SemanticChunker, CodeChunk
from .vector_store import VectorStore, SearchResult
from .call_graph import CallGraph
from .git_context import GitContext


@dataclass
class Context:
    """Assembled context for a query."""
    semantic_results: List[SearchResult]
    call_graph_context: str
    git_context: str
    formatted: str


class ContextRetriever:
    """
    Unified retrieval across all context sources.
    
    Combines:
    1. Semantic search (embeddings)
    2. Call graph relationships
    3. Git history context
    
    This is RAG (Retrieval-Augmented Generation) for code.
    
    Reference:
        Lewis, P., et al. (2020). Retrieval-Augmented Generation for 
        Knowledge-Intensive NLP Tasks. NeurIPS.
    """
    
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        
        # Components
        self.embedder = Embedder()
        self.chunker = SemanticChunker(
            chunk_size=config.chunk_size,
            overlap=config.chunk_overlap,
        )
        self.vector_store = VectorStore(
            str(self.workspace / ".forge" / "vectors")
        )
        self.call_graph = CallGraph(workspace)
        self.git = GitContext(workspace)
        
        self._indexed = False
    
    def index(self, force: bool = False):
        """Index the codebase for semantic search."""
        if self._indexed and not force:
            return
        
        if force:
            self.vector_store.clear()
        
        # Find all source files
        extensions = [".py", ".js", ".ts", ".tsx", ".go", ".rs", ".java", ".cpp", ".c"]
        all_chunks: List[CodeChunk] = []
        
        for ext in extensions:
            for file_path in self.workspace.rglob(f"*{ext}"):
                if self._should_skip(file_path):
                    continue
                
                chunks = self.chunker.chunk_file(str(file_path))
                all_chunks.extend(chunks)
        
        if not all_chunks:
            return
        
        # Generate embeddings and store
        texts = [c.content for c in all_chunks]
        embeddings = self.embedder.embed_batch(texts)
        
        added = self.vector_store.add_chunks(all_chunks, embeddings)
        print(f"Indexed {added} code chunks")
        
        # Build call graph
        if config.enable_call_graph:
            self.call_graph.build(force=force)
            print(f"Built call graph: {len(self.call_graph.symbols)} symbols")
        
        self._indexed = True
    
    def _should_skip(self, path: Path) -> bool:
        """Skip certain directories."""
        skip_dirs = {"node_modules", ".git", "__pycache__", "venv", ".venv", 
                     "dist", "build", ".forge"}
        return any(part in skip_dirs for part in path.parts)
    
    def retrieve(
        self,
        query: str,
        max_results: int = 5,
        include_call_graph: bool = True,
        include_git: bool = True,
    ) -> Context:
        """
        Retrieve relevant context for a query.
        
        Args:
            query: Natural language query
            max_results: Maximum semantic search results
            include_call_graph: Include call graph context
            include_git: Include git history
            
        Returns:
            Context object with all assembled context
        """
        # 1. Semantic search
        query_embedding = self.embedder.embed(query)
        semantic_results = self.vector_store.search(query_embedding, limit=max_results)
        
        # 2. Call graph context (for symbols found in results)
        cg_context = ""
        if include_call_graph and semantic_results:
            cg_parts = []
            for result in semantic_results[:3]:
                if result.symbol_name:
                    callers = self.call_graph.get_callers(result.symbol_name)
                    if callers:
                        cg_parts.append(f"{result.symbol_name} is called by: {', '.join(callers[:3])}")
            cg_context = "\n".join(cg_parts)
        
        # 3. Git context
        git_ctx = ""
        if include_git and config.enable_git_context:
            git_ctx = self.git.get_recent_context(limit=3)
        
        # 4. Format into single context string
        formatted = self._format_context(semantic_results, cg_context, git_ctx)
        
        return Context(
            semantic_results=semantic_results,
            call_graph_context=cg_context,
            git_context=git_ctx,
            formatted=formatted,
        )
    
    def _format_context(
        self, 
        results: List[SearchResult], 
        cg_context: str, 
        git_context: str
    ) -> str:
        """Format all context sources into a single string."""
        parts = []
        
        # Semantic search results
        if results:
            parts.append("### Relevant Code\n")
            for r in results:
                parts.append(f"**{r.file_path}** (lines {r.start_line}-{r.end_line})")
                parts.append(f"```\n{r.content[:500]}\n```\n")
        
        # Call graph
        if cg_context:
            parts.append(f"### Code Relationships\n{cg_context}\n")
        
        # Git history
        if git_context:
            parts.append(f"### {git_context}\n")
        
        return "\n".join(parts) if parts else "(No relevant context found)"


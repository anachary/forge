"""Context engine components - Full Context Engineering Playbook Implementation."""

# Original components
from .embedder import Embedder
from .chunker import SemanticChunker, CodeChunk
from .vector_store import VectorStore, SearchResult
from .retriever import ContextRetriever
from .call_graph import CallGraph
from .git_context import GitContext

# Step 1: Context Boundaries
from .scope import (
    ContextScope, QueryComplexity, CONTEXT_SCOPES,
    SecurityContextFilter, get_scope_for_complexity, get_scope_for_intent
)

# Step 4: Query Complexity Routing
from .complexity_router import (
    QueryComplexityRouter, QueryAnalysis, RetrievalStrategy,
    AdaptiveRetrieval
)

# Step 5: Context Window Optimization
from .window_optimizer import (
    ContextWindowOptimizer, TokenCounter, TokenBudget,
    ModelContextWindow, ContextQualityMetrics, format_context_for_model
)

# Enhanced retriever with full playbook implementation
from .enhanced_retriever import (
    EnhancedContextRetriever, EnhancedContext
)

# Verification
from .playbook_verifier import PlaybookVerifier, PlaybookStep

__all__ = [
    # Original
    "Embedder",
    "SemanticChunker",
    "CodeChunk",
    "VectorStore",
    "SearchResult",
    "ContextRetriever",
    "CallGraph",
    "GitContext",
    
    # Step 1
    "ContextScope",
    "QueryComplexity",
    "CONTEXT_SCOPES",
    "SecurityContextFilter",
    "get_scope_for_complexity",
    "get_scope_for_intent",
    
    # Step 4
    "QueryComplexityRouter",
    "QueryAnalysis",
    "RetrievalStrategy",
    "AdaptiveRetrieval",
    
    # Step 5
    "ContextWindowOptimizer",
    "TokenCounter",
    "TokenBudget",
    "ModelContextWindow",
    "ContextQualityMetrics",
    "format_context_for_model",
    
    # Enhanced
    "EnhancedContextRetriever",
    "EnhancedContext",
    
    # Verification
    "PlaybookVerifier",
    "PlaybookStep",
]


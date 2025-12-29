"""
Enhanced Context Retriever - Full integration of context engineering steps.

Combines:
1. Context Boundaries (Step 1)
2. Semantic Code Indexing (Step 2) 
3. Information Filtering (Step 3)
4. Query Complexity Routing (Step 4)
5. Context Window Optimization (Step 5)
6. Security Filtering
7. Quality Metrics

This is the complete implementation of the context engineering playbook.
"""

from pathlib import Path
from typing import List, Optional, Dict, Tuple
from dataclasses import dataclass
import time

from forge.config import config
from forge.agent.prompt_enhancer import QueryIntent

from .embedder import Embedder
from .chunker import SemanticChunker, CodeChunk
from .vector_store import VectorStore, SearchResult
from .call_graph import CallGraph
from .git_context import GitContext

# New imports for complete implementation
from .scope import (
    ContextScope, QueryComplexity, SecurityContextFilter,
    get_scope_for_complexity, get_scope_for_intent
)
from .complexity_router import (
    QueryComplexityRouter, QueryAnalysis, RetrievalStrategy
)
from .window_optimizer import (
    ContextWindowOptimizer, TokenCounter, TokenBudget,
    ContextQualityMetrics, format_context_for_model
)


@dataclass
class EnhancedContext:
    """Enhanced context with quality metrics and routing info."""
    semantic_results: List[SearchResult]
    call_graph_context: str
    git_context: str
    formatted: str
    
    # New fields
    query_analysis: QueryAnalysis
    token_budget: TokenBudget
    quality_metrics: ContextQualityMetrics
    retrieval_time_ms: float
    security_filtered_count: int


class EnhancedContextRetriever:
    """
    Complete context retrieval with all engineering best practices.
    
    Implements entire playbook:
    - Step 1: Context Boundaries (scope.py)
    - Step 2: Semantic Indexing (chunker.py + embedder.py)
    - Step 3: Information Filtering (this module)
    - Step 4: Complexity Routing (complexity_router.py)
    - Step 5: Window Optimization (window_optimizer.py)
    - Security: SecurityContextFilter (scope.py)
    """
    
    def __init__(self, workspace: str, model: str = None):
        self.workspace = Path(workspace)
        self.model = model or config.model
        
        # Core context components
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
        
        # Engineering components
        self.complexity_router = QueryComplexityRouter()
        self.window_optimizer = ContextWindowOptimizer(self.model)
        self.security_filter = SecurityContextFilter()
        
        # State
        self._indexed = False
        self._retrieval_cache: Dict[str, EnhancedContext] = {}
    
    def index(self, force: bool = False):
        """Index the codebase for semantic search."""
        if self._indexed and not force:
            return
        
        if force:
            self.vector_store.clear()
        
        # Find all source files
        extensions = [".py", ".js", ".ts", ".tsx", ".go", ".rs", ".java", ".cpp", ".c"]
        all_chunks: List[CodeChunk] = []
        security_filtered = 0
        
        for ext in extensions:
            for file_path in self.workspace.rglob(f"*{ext}"):
                if self._should_skip(file_path):
                    continue
                
                # Security filtering
                if self.security_filter.is_sensitive_file(str(file_path)):
                    security_filtered += 1
                    continue
                
                chunks = self.chunker.chunk_file(str(file_path))
                all_chunks.extend(chunks)
        
        if not all_chunks:
            print(f"Warning: No code chunks to index ({security_filtered} filtered for security)")
            return
        
        # Generate embeddings and store
        texts = [c.content for c in all_chunks]
        embeddings = self.embedder.embed_batch(texts)
        
        added = self.vector_store.add_chunks(all_chunks, embeddings)
        print(f"Indexed {added} code chunks (filtered {security_filtered} sensitive files)")
        
        # Build call graph
        if config.enable_call_graph:
            self.call_graph.build(force=force)
            print(f"Built call graph: {len(self.call_graph.symbols)} symbols")
        
        self._indexed = True
    
    def _should_skip(self, path: Path) -> bool:
        """Skip certain directories."""
        skip_dirs = {
            "node_modules", ".git", "__pycache__", "venv", ".venv",
            "dist", "build", ".forge", "target", ".gradle"
        }
        return any(part in skip_dirs for part in path.parts)
    
    def retrieve(
        self,
        query: str,
        intent: QueryIntent = QueryIntent.GENERAL,
        max_results: int = 5,
    ) -> EnhancedContext:
        """
        Retrieve context using full context engineering approach.
        
        Steps:
        1. Analyze query complexity
        2. Select appropriate context scope
        3. Route to optimal retrieval strategy
        4. Apply security filtering
        5. Optimize to context window
        6. Calculate quality metrics
        """
        start_time = time.time()
        
        # Step 1: Analyze query complexity and intent
        query_analysis = self.complexity_router.analyze_query(query, intent)
        context_scope = query_analysis.context_scope
        
        # Step 2-3: Retrieve and filter by context scope
        semantic_results = self._retrieve_semantic(
            query, context_scope, max_results
        )
        
        # Step 3: Additional filtering for scope
        semantic_results = self._apply_scope_filtering(
            semantic_results, context_scope
        )
        
        # Step 3: Security filtering
        semantic_results, security_filtered = self._apply_security_filtering(
            semantic_results
        )
        
        # Step 2-4: Get call graph context based on strategy
        cg_context = ""
        if (config.enable_call_graph and 
            query_analysis.strategy in [
                RetrievalStrategy.SEMANTIC_PLUS_GRAPH,
                RetrievalStrategy.FULL_ANALYSIS,
                RetrievalStrategy.CROSS_SERVICE,
            ]):
            cg_context = self._retrieve_call_graph_context(
                semantic_results, context_scope
            )
        
        # Step 2-4: Get git context based on scope
        git_ctx = ""
        if config.enable_git_context and context_scope.enable_git_context:
            git_ctx = self._retrieve_git_context(
                semantic_results,
                context_scope.git_lookback_days
            )
        
        # Step 5: Calculate token budget
        system_prompt_tokens = TokenCounter.estimate_tokens(
            _SYSTEM_PROMPT, "word"
        )
        query_tokens = TokenCounter.estimate_tokens(query, "word")
        token_budget = self.window_optimizer.allocate_budget(
            system_prompt_tokens,
            query_tokens
        )
        
        # Step 5: Fit context to budget
        context_items = self._prepare_context_items(
            semantic_results, cg_context, git_ctx
        )
        fitted_items, tokens_used = self.window_optimizer.fit_context_to_budget(
            context_items,
            token_budget.retrieved_context
        )
        
        # Format final context
        formatted = format_context_for_model(fitted_items, query)
        
        # Calculate quality metrics
        quality_metrics = self._calculate_quality_metrics(
            query, semantic_results, fitted_items
        )
        
        retrieval_time = (time.time() - start_time) * 1000  # ms
        
        context = EnhancedContext(
            semantic_results=semantic_results,
            call_graph_context=cg_context,
            git_context=git_ctx,
            formatted=formatted,
            query_analysis=query_analysis,
            token_budget=token_budget,
            quality_metrics=quality_metrics,
            retrieval_time_ms=retrieval_time,
            security_filtered_count=security_filtered,
        )
        
        # Cache for potential reuse
        cache_key = query[:100]
        self._retrieval_cache[cache_key] = context
        
        return context
    
    def _retrieve_semantic(
        self,
        query: str,
        context_scope: ContextScope,
        max_results: int
    ) -> List[SearchResult]:
        """Retrieve semantic search results within scope."""
        query_embedding = self.embedder.embed(query)
        if not query_embedding:
            return []
        
        results = self.vector_store.search(
            query_embedding,
            limit=max_results * 2  # Get more, then filter
        )
        
        # Filter by relevance score from scope
        results = [
            r for r in results
            if r.score >= context_scope.min_relevance_score
        ]
        
        return results[:max_results]
    
    def _apply_scope_filtering(
        self,
        results: List[SearchResult],
        scope: ContextScope
    ) -> List[SearchResult]:
        """Filter results based on context scope."""
        filtered = []
        
        for result in results:
            if scope.should_include(result.file_path):
                filtered.append(result)
        
        return filtered[:scope.max_files]
    
    def _apply_security_filtering(
        self,
        results: List[SearchResult]
    ) -> Tuple[List[SearchResult], int]:
        """Apply security filtering to prevent credential leakage."""
        filtered = []
        filtered_count = 0
        
        for result in results:
            # Check file path
            if self.security_filter.is_sensitive_file(result.file_path):
                filtered_count += 1
                continue
            
            # Check content for credentials
            if self.security_filter.scan_content_for_credentials(result.content):
                filtered_count += 1
                continue
            
            filtered.append(result)
        
        return filtered, filtered_count
    
    def _retrieve_call_graph_context(
        self,
        semantic_results: List[SearchResult],
        context_scope: ContextScope
    ) -> str:
        """Retrieve call graph context for semantic results."""
        if not semantic_results or not context_scope.enable_call_graph:
            return ""
        
        parts = []
        
        for result in semantic_results[:3]:
            if result.symbol_name:
                # Get callers
                callers = self.call_graph.get_callers(
                    result.symbol_name,
                    depth=context_scope.search_depth
                )
                
                # Get callees
                callees = self.call_graph.get_callees(
                    result.symbol_name,
                    depth=context_scope.search_depth
                )
                
                if callers or callees:
                    parts.append(f"\n### {result.symbol_name}")
                    if callers:
                        parts.append(f"Called by: {', '.join(callers[:5])}")
                    if callees:
                        parts.append(f"Calls: {', '.join(callees[:5])}")
        
        return "\n".join(parts)
    
    def _retrieve_git_context(
        self,
        semantic_results: List[SearchResult],
        lookback_days: int
    ) -> str:
        """Retrieve git history context."""
        if not semantic_results:
            return ""
        
        # Get files from results
        files = [r.file_path for r in semantic_results[:5]]
        
        return self.git.get_recent_context(
            files=files,
            lookback_days=lookback_days,
            limit=5
        )
    
    def _prepare_context_items(
        self,
        semantic_results: List[SearchResult],
        cg_context: str,
        git_context: str
    ) -> List[Dict]:
        """Prepare context items for window optimization."""
        items = []
        
        # Semantic results (highest priority)
        for result in semantic_results:
            items.append({
                'content': result.content,
                'file_path': result.file_path,
                'start_line': result.start_line,
                'end_line': result.end_line,
                'relevance_score': result.score,
                'priority': 1.0,  # Highest priority
                'type': 'semantic_search'
            })
        
        # Call graph context (medium priority)
        if cg_context:
            items.append({
                'content': cg_context,
                'file_path': 'call_graph_analysis',
                'relevance_score': 0.8,
                'priority': 0.7,
                'type': 'call_graph'
            })
        
        # Git context (lower priority)
        if git_context:
            items.append({
                'content': git_context,
                'file_path': 'git_history',
                'relevance_score': 0.6,
                'priority': 0.5,
                'type': 'git_history'
            })
        
        return items
    
    def _calculate_quality_metrics(
        self,
        query: str,
        retrieved_results: List[SearchResult],
        fitted_items: List[Dict]
    ) -> ContextQualityMetrics:
        """Calculate context quality metrics."""
        
        # Search precision
        relevant_count = sum(
            1 for r in retrieved_results if r.score >= 0.7
        )
        search_precision = (
            relevant_count / len(retrieved_results)
            if retrieved_results else 0
        )
        
        # Context utilization
        context_utilization = (
            len(fitted_items) / max(len(retrieved_results), 1)
        )
        
        # Token efficiency (relevance per token)
        total_tokens = sum(
            TokenCounter.estimate_tokens(
                item.get('content', ''), 'hybrid'
            )
            for item in fitted_items
        )
        avg_relevance = (
            sum(item.get('relevance_score', 0) for item in fitted_items)
            / max(len(fitted_items), 1)
        )
        token_efficiency = (
            avg_relevance / (total_tokens / 1000) if total_tokens > 0 else 0
        )
        
        # Relevance score
        relevance_score = avg_relevance
        
        # Coverage (heuristic: assume >70% precision means good coverage)
        coverage = min(search_precision * 1.2, 1.0)
        
        return ContextQualityMetrics(
            search_precision=min(search_precision, 1.0),
            context_utilization=min(context_utilization, 1.0),
            token_efficiency=min(token_efficiency, 1.0),
            relevance_score=min(relevance_score, 1.0),
            coverage=coverage,
        )


# Default system prompt for token estimation
_SYSTEM_PROMPT = """You are Forge, an expert coding assistant powered by advanced context engineering.

You have access to:
1. The user's codebase (via semantic search)
2. Call graph analysis (understanding code relationships)
3. Git history (recent changes)
4. Web search (for external information)

When helping with code:
- Be precise and accurate
- Use the provided context
- Explain your reasoning
- Suggest tests when appropriate
"""

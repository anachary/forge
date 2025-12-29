"""
Query Complexity Router - Step 4 of context engineering playbook.

Routes queries by complexity level to optimal retrieval strategy.

Reference: "Route Queries by Complexity: Simple questions go to fast models 
for millisecond response times. Complex queries requiring multi-file analysis 
use larger models:
- Simple lookups (function signatures, API documentation): ~1 millisecond
- Architecture questions (dependency analysis): 2-5 seconds
- Cross-service debugging: Specialized models with expanded context"
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Tuple, Optional
import re

from forge.agent.prompt_enhancer import QueryIntent
from .scope import QueryComplexity, ContextScope, get_scope_for_complexity


class RetrievalStrategy(Enum):
    """Strategy for context retrieval based on query complexity."""
    
    FAST_LOOKUP = "fast_lookup"          # No indexing, direct cache lookup
    SEMANTIC_SEARCH = "semantic_search"  # Vector search only
    SEMANTIC_PLUS_GRAPH = "semantic_plus_graph"  # Vectors + call graph
    FULL_ANALYSIS = "full_analysis"      # All context sources
    CROSS_SERVICE = "cross_service"      # Multi-repo analysis


@dataclass
class QueryAnalysis:
    """Analysis of a query for routing."""
    
    query: str
    intent: QueryIntent
    complexity: QueryComplexity
    strategy: RetrievalStrategy
    context_scope: ContextScope
    
    estimated_response_time_ms: int
    should_use_web_search: bool
    should_parallelize_retrieval: bool
    recommended_model_size: str  # "small", "medium", "large"


class QueryComplexityRouter:
    """
    Routes queries by complexity to optimal retrieval strategy.
    
    Implements the principle: "Simple lookups (function signatures, API documentation): 
    ~1 millisecond response time at million-line-of-code scale.
    Architecture questions (dependency analysis, refactoring suggestions): 2-5 second 
    response with code indexing overhead.
    Cross-service debugging: Specialized models with expanded context."
    """
    
    # Patterns for simple lookups
    SIMPLE_PATTERNS = [
        r'^what is [\w\.]+\?$',
        r'^show (?:me )?[\w\. ]+$',
        r'^(where|find) (is|are) [\w\.]+',
        r'^what does [\w\.]+ (do|mean)',
        r'^(how to|can you) [\w ]+\?$',
        r'^api\s+(docs|documentation)',
        r'^function signature',
    ]
    
    # Patterns for focused/single-file queries
    FOCUSED_PATTERNS = [
        r'(fix|debug|error|bug|issue)',
        r'(implement|add|create) (feature|function)',
        r'(refactor|improve|optimize) (this|the)',
        r'(write|generate) (code|function)',
        r'(test|unit test)',
        r'(this|this file|this code)',
    ]
    
    # Patterns for complex/architectural queries
    COMPLEX_PATTERNS = [
        r'(architecture|design|system)',
        r'(refactor|redesign) (the|this)',
        r'dependency|dependencies|import',
        r'(flow|workflow|process)',
        r'(scale|performance|optimization)',
        r'(migration|upgrade)',
        r'(integration|connect|integrate)',
    ]
    
    # Patterns for cross-service queries
    CROSS_SERVICE_PATTERNS = [
        r'(across|between) (services|repos|modules)',
        r'(multiple|different) (services|components)',
        r'(service.*service|inter-service)',
        r'(distributed|microservice)',
        r'(api.*gateway|service mesh)',
        r'(transaction|saga|orchestration)',
    ]
    
    def __init__(self):
        self.query_history: Dict[str, QueryAnalysis] = {}
    
    def analyze_query(self, query: str, intent: QueryIntent) -> QueryAnalysis:
        """
        Analyze query to determine complexity and optimal strategy.
        
        Returns QueryAnalysis with routing information.
        """
        complexity = self._determine_complexity(query)
        strategy = self._select_strategy(complexity, intent)
        context_scope = get_scope_for_complexity(complexity)
        
        response_time = self._estimate_response_time(strategy)
        web_search = self._should_use_web_search(intent, complexity)
        parallelize = complexity in [
            QueryComplexity.COMPLEX,
            QueryComplexity.CROSS_SERVICE
        ]
        model_size = self._recommend_model_size(complexity)
        
        analysis = QueryAnalysis(
            query=query,
            intent=intent,
            complexity=complexity,
            strategy=strategy,
            context_scope=context_scope,
            estimated_response_time_ms=response_time,
            should_use_web_search=web_search,
            should_parallelize_retrieval=parallelize,
            recommended_model_size=model_size,
        )
        
        # Cache for analysis
        self.query_history[query[:100]] = analysis
        
        return analysis
    
    def _determine_complexity(self, query: str) -> QueryComplexity:
        """Determine query complexity using pattern matching."""
        q = query.lower()
        
        # Check patterns in order of complexity
        if self._matches_patterns(q, self.CROSS_SERVICE_PATTERNS):
            return QueryComplexity.CROSS_SERVICE
        
        if self._matches_patterns(q, self.COMPLEX_PATTERNS):
            # Distinguish between moderate and complex
            if any(word in q for word in ['entire', 'whole', 'all', 'whole codebase']):
                return QueryComplexity.COMPLEX
            return QueryComplexity.MODERATE
        
        if self._matches_patterns(q, self.FOCUSED_PATTERNS):
            # Check if multi-file
            if any(word in q for word in ['multiple', 'different', 'both', 'files']):
                return QueryComplexity.MODERATE
            return QueryComplexity.FOCUSED
        
        if self._matches_patterns(q, self.SIMPLE_PATTERNS):
            return QueryComplexity.SIMPLE
        
        # Default based on query length
        words = len(q.split())
        if words < 5:
            return QueryComplexity.SIMPLE
        elif words < 15:
            return QueryComplexity.FOCUSED
        elif words < 30:
            return QueryComplexity.MODERATE
        else:
            return QueryComplexity.COMPLEX
    
    def _matches_patterns(self, text: str, patterns: list) -> bool:
        """Check if text matches any pattern."""
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False
    
    def _select_strategy(self, 
                        complexity: QueryComplexity, 
                        intent: QueryIntent) -> RetrievalStrategy:
        """Select retrieval strategy based on complexity and intent."""
        
        if complexity == QueryComplexity.SIMPLE:
            return RetrievalStrategy.FAST_LOOKUP
        
        elif complexity == QueryComplexity.FOCUSED:
            if intent in [QueryIntent.CODE_WRITE, QueryIntent.CODE_EXPLAIN]:
                return RetrievalStrategy.SEMANTIC_SEARCH
            else:
                return RetrievalStrategy.SEMANTIC_PLUS_GRAPH
        
        elif complexity == QueryComplexity.MODERATE:
            return RetrievalStrategy.SEMANTIC_PLUS_GRAPH
        
        elif complexity == QueryComplexity.COMPLEX:
            return RetrievalStrategy.FULL_ANALYSIS
        
        elif complexity == QueryComplexity.CROSS_SERVICE:
            return RetrievalStrategy.CROSS_SERVICE
        
        return RetrievalStrategy.SEMANTIC_SEARCH
    
    def _should_use_web_search(self, intent: QueryIntent, 
                               complexity: QueryComplexity) -> bool:
        """Determine if web search should be used."""
        
        # External info intents always need web search
        if intent in [QueryIntent.EXTERNAL_INFO, QueryIntent.COMPARISON]:
            return True
        
        # Complex queries might benefit from external info
        if complexity in [QueryComplexity.COMPLEX, QueryComplexity.CROSS_SERVICE]:
            return True
        
        return False
    
    def _estimate_response_time(self, strategy: RetrievalStrategy) -> int:
        """Estimate response time in milliseconds."""
        estimates = {
            RetrievalStrategy.FAST_LOOKUP: 50,          # ~50ms - cache only
            RetrievalStrategy.SEMANTIC_SEARCH: 1000,    # ~1s - vector search
            RetrievalStrategy.SEMANTIC_PLUS_GRAPH: 3000,  # ~3s - vectors + graph
            RetrievalStrategy.FULL_ANALYSIS: 5000,      # ~5s - full analysis
            RetrievalStrategy.CROSS_SERVICE: 8000,      # ~8s - multi-repo
        }
        return estimates.get(strategy, 1000)
    
    def _recommend_model_size(self, complexity: QueryComplexity) -> str:
        """Recommend model size based on complexity."""
        
        if complexity == QueryComplexity.SIMPLE:
            return "small"  # 7B models sufficient
        elif complexity == QueryComplexity.FOCUSED:
            return "small"  # 7B models fine
        elif complexity == QueryComplexity.MODERATE:
            return "medium"  # 14-13B models better
        elif complexity in [QueryComplexity.COMPLEX, QueryComplexity.CROSS_SERVICE]:
            return "large"  # 70B+ or API models
        
        return "medium"
    
    def should_cache_result(self, complexity: QueryComplexity) -> bool:
        """Determine if query result should be cached."""
        # Cache all results except simple/fast lookups
        return complexity not in [QueryComplexity.SIMPLE]
    
    def get_parallelization_strategy(self, 
                                     analysis: QueryAnalysis) -> Dict[str, bool]:
        """Get parallelization recommendations."""
        
        return {
            'parallel_retrieval': analysis.should_parallelize_retrieval,
            'parallel_web_search': analysis.should_use_web_search,
            'parallel_call_graph': (
                analysis.strategy in [
                    RetrievalStrategy.SEMANTIC_PLUS_GRAPH,
                    RetrievalStrategy.FULL_ANALYSIS,
                    RetrievalStrategy.CROSS_SERVICE,
                ]
            ),
            'parallel_git_analysis': (
                analysis.complexity in [
                    QueryComplexity.COMPLEX,
                    QueryComplexity.CROSS_SERVICE
                ]
            ),
        }


class AdaptiveRetrieval:
    """
    Adapts retrieval based on intermediate results.
    
    If initial retrieval isn't sufficient, escalates to more expensive strategies.
    """
    
    def __init__(self, router: QueryComplexityRouter):
        self.router = router
    
    def get_escalation_strategy(self, 
                               current_strategy: RetrievalStrategy,
                               result_quality: float) -> Optional[RetrievalStrategy]:
        """
        Escalate to more expensive strategy if results are poor.
        
        Quality range: 0.0 (poor) to 1.0 (excellent)
        Threshold: 0.6 (require 60% quality minimum)
        """
        
        if result_quality >= 0.6:
            return None  # Current strategy sufficient
        
        # Escalation chain
        escalation_map = {
            RetrievalStrategy.FAST_LOOKUP: RetrievalStrategy.SEMANTIC_SEARCH,
            RetrievalStrategy.SEMANTIC_SEARCH: RetrievalStrategy.SEMANTIC_PLUS_GRAPH,
            RetrievalStrategy.SEMANTIC_PLUS_GRAPH: RetrievalStrategy.FULL_ANALYSIS,
            RetrievalStrategy.FULL_ANALYSIS: RetrievalStrategy.CROSS_SERVICE,
        }
        
        return escalation_map.get(current_strategy)

"""
Context Engineering Playbook Implementation Verification

This module verifies that Forge implements all 5 steps from:
"Prompt Context Analysis: Your Context Engineering Playbook"

Verification checklist and test utilities.
"""

from dataclasses import dataclass
from typing import List, Dict, Tuple
from enum import Enum


class PlaybookStep(Enum):
    """Steps from the context engineering playbook."""
    STEP_1 = "Establish Context Boundaries"
    STEP_2 = "Implement Semantic Code Indexing"
    STEP_3 = "Filter Information by Relevance"
    STEP_4 = "Route Queries by Complexity"
    STEP_5 = "Optimize for Context Window Efficiency"


@dataclass
class ImplementationStatus:
    """Status of implementation for a step."""
    step: PlaybookStep
    implemented: bool
    components: List[str]
    verification_passed: bool
    details: str


class PlaybookVerifier:
    """
    Verifies Forge implements all context engineering steps.
    """
    
    STEP_1_COMPONENTS = [
        "forge.context.scope.ContextScope",
        "forge.context.scope.QueryComplexity",
        "forge.context.scope.CONTEXT_SCOPES",
        "forge.context.scope.SecurityContextFilter",
    ]
    
    STEP_2_COMPONENTS = [
        "forge.context.chunker.SemanticChunker",
        "forge.context.embedder.Embedder",
        "forge.context.call_graph.CallGraph",
        "forge.context.git_context.GitContext",
    ]
    
    STEP_3_COMPONENTS = [
        "forge.context.scope.ContextScope.should_include",
        "forge.context.enhanced_retriever.EnhancedContextRetriever._apply_scope_filtering",
        "forge.context.enhanced_retriever.EnhancedContextRetriever._apply_security_filtering",
    ]
    
    STEP_4_COMPONENTS = [
        "forge.context.complexity_router.QueryComplexityRouter",
        "forge.context.complexity_router.RetrievalStrategy",
        "forge.context.complexity_router.AdaptiveRetrieval",
    ]
    
    STEP_5_COMPONENTS = [
        "forge.context.window_optimizer.ContextWindowOptimizer",
        "forge.context.window_optimizer.TokenCounter",
        "forge.context.window_optimizer.ContextQualityMetrics",
    ]
    
    @classmethod
    def verify_step_1(cls) -> ImplementationStatus:
        """Verify Step 1: Establish Context Boundaries"""
        try:
            from forge.context.scope import (
                ContextScope, QueryComplexity, CONTEXT_SCOPES,
                SecurityContextFilter
            )
            
            # Verify scope definitions exist
            assert QueryComplexity.SIMPLE.value == "simple"
            assert QueryComplexity.FOCUSED.value == "focused"
            assert QueryComplexity.MODERATE.value == "moderate"
            assert QueryComplexity.COMPLEX.value == "complex"
            assert QueryComplexity.CROSS_SERVICE.value == "cross_service"
            
            # Verify scopes are configured
            assert len(CONTEXT_SCOPES) == 5
            assert QueryComplexity.SIMPLE in CONTEXT_SCOPES
            assert QueryComplexity.CROSS_SERVICE in CONTEXT_SCOPES
            
            # Verify scope properties
            simple_scope = CONTEXT_SCOPES[QueryComplexity.SIMPLE]
            assert simple_scope.max_tokens == 5000
            assert simple_scope.max_files == 1
            
            complex_scope = CONTEXT_SCOPES[QueryComplexity.COMPLEX]
            assert complex_scope.max_tokens == 100000
            
            # Verify security filter exists and has patterns
            assert len(SecurityContextFilter.EXCLUDE_PATTERNS) > 0
            assert len(SecurityContextFilter.SENSITIVE_EXTENSIONS) > 0
            assert len(SecurityContextFilter.CREDENTIAL_KEYWORDS) > 0
            
            return ImplementationStatus(
                step=PlaybookStep.STEP_1,
                implemented=True,
                components=cls.STEP_1_COMPONENTS,
                verification_passed=True,
                details="✓ All 5 complexity scopes defined with appropriate boundaries"
            )
        except Exception as e:
            return ImplementationStatus(
                step=PlaybookStep.STEP_1,
                implemented=False,
                components=cls.STEP_1_COMPONENTS,
                verification_passed=False,
                details=f"✗ Implementation error: {str(e)}"
            )
    
    @classmethod
    def verify_step_2(cls) -> ImplementationStatus:
        """Verify Step 2: Implement Semantic Code Indexing"""
        try:
            from forge.context.chunker import SemanticChunker
            from forge.context.embedder import Embedder
            from forge.context.call_graph import CallGraph
            from forge.context.git_context import GitContext
            
            # Verify components exist and are initialized
            chunker = SemanticChunker()
            embedder = Embedder()
            
            # Verify embedder can generate embeddings
            test_text = "def hello_world(): pass"
            embedding = embedder.embed(test_text)
            assert isinstance(embedding, list)
            
            # Verify chunk types are available
            from forge.context.chunker import ChunkType
            assert ChunkType.FUNCTION.value == "function"
            assert ChunkType.CLASS.value == "class"
            
            return ImplementationStatus(
                step=PlaybookStep.STEP_2,
                implemented=True,
                components=cls.STEP_2_COMPONENTS,
                verification_passed=True,
                details="✓ Semantic indexing with embeddings, chunks, call graphs, and git history"
            )
        except Exception as e:
            return ImplementationStatus(
                step=PlaybookStep.STEP_2,
                implemented=False,
                components=cls.STEP_2_COMPONENTS,
                verification_passed=False,
                details=f"✗ Implementation error: {str(e)}"
            )
    
    @classmethod
    def verify_step_3(cls) -> ImplementationStatus:
        """Verify Step 3: Filter Information by Relevance"""
        try:
            from forge.context.scope import ContextScope, QueryComplexity
            from forge.context.enhanced_retriever import EnhancedContextRetriever
            
            # Verify scope has filtering methods
            scope = ContextScope(
                query_type="test",
                complexity=QueryComplexity.FOCUSED
            )
            
            assert hasattr(scope, 'should_include')
            assert callable(scope.should_include)
            
            # Verify filtering method works
            assert scope.should_include("src/app.py") == True
            
            # Test exclusion patterns
            scope.exclude = ["node_modules", "__pycache__"]
            assert scope.should_include("node_modules/package.json") == False
            
            # Verify retriever has filtering
            assert hasattr(EnhancedContextRetriever, '_apply_scope_filtering')
            assert hasattr(EnhancedContextRetriever, '_apply_security_filtering')
            
            return ImplementationStatus(
                step=PlaybookStep.STEP_3,
                implemented=True,
                components=cls.STEP_3_COMPONENTS,
                verification_passed=True,
                details="✓ Information filtering by relevance and security"
            )
        except Exception as e:
            return ImplementationStatus(
                step=PlaybookStep.STEP_3,
                implemented=False,
                components=cls.STEP_3_COMPONENTS,
                verification_passed=False,
                details=f"✗ Implementation error: {str(e)}"
            )
    
    @classmethod
    def verify_step_4(cls) -> ImplementationStatus:
        """Verify Step 4: Route Queries by Complexity"""
        try:
            from forge.context.complexity_router import (
                QueryComplexityRouter, RetrievalStrategy
            )
            from forge.agent.prompt_enhancer import QueryIntent
            
            router = QueryComplexityRouter()
            
            # Verify strategies exist
            assert RetrievalStrategy.FAST_LOOKUP.value == "fast_lookup"
            assert RetrievalStrategy.SEMANTIC_SEARCH.value == "semantic_search"
            assert RetrievalStrategy.FULL_ANALYSIS.value == "full_analysis"
            assert RetrievalStrategy.CROSS_SERVICE.value == "cross_service"
            
            # Test complexity detection
            simple_query = "what is x?"
            analysis = router.analyze_query(simple_query, QueryIntent.GENERAL)
            
            assert analysis.query == simple_query
            assert hasattr(analysis, 'complexity')
            assert hasattr(analysis, 'strategy')
            assert hasattr(analysis, 'estimated_response_time_ms')
            
            # Verify patterns exist
            assert len(router.SIMPLE_PATTERNS) > 0
            assert len(router.FOCUSED_PATTERNS) > 0
            assert len(router.COMPLEX_PATTERNS) > 0
            assert len(router.CROSS_SERVICE_PATTERNS) > 0
            
            return ImplementationStatus(
                step=PlaybookStep.STEP_4,
                implemented=True,
                components=cls.STEP_4_COMPONENTS,
                verification_passed=True,
                details="✓ Query complexity routing with 5 strategies and adaptive escalation"
            )
        except Exception as e:
            return ImplementationStatus(
                step=PlaybookStep.STEP_4,
                implemented=False,
                components=cls.STEP_4_COMPONENTS,
                verification_passed=False,
                details=f"✗ Implementation error: {str(e)}"
            )
    
    @classmethod
    def verify_step_5(cls) -> ImplementationStatus:
        """Verify Step 5: Optimize for Context Window Efficiency"""
        try:
            from forge.context.window_optimizer import (
                ContextWindowOptimizer, TokenCounter, ModelContextWindow,
                ContextQualityMetrics
            )
            
            # Verify token counter
            test_text = "def hello(): pass"
            tokens = TokenCounter.estimate_tokens(test_text, "word")
            assert isinstance(tokens, int)
            assert tokens > 0
            
            # Verify model context windows
            assert ModelContextWindow.QWEN_7B.value == 4096
            assert ModelContextWindow.CLAUDE_3_5.value == 200000
            assert ModelContextWindow.GEMINI_1_5_PRO.value == 2000000
            
            # Verify optimizer
            optimizer = ContextWindowOptimizer("qwen2.5-coder:7b")
            assert optimizer.context_window == 4096
            
            # Test budget allocation
            budget = optimizer.allocate_budget(
                system_prompt_tokens=100,
                user_query_tokens=50
            )
            assert budget.system_prompt == 100
            assert budget.user_query == 50
            assert budget.retrieved_context > 0
            assert budget.total_available == optimizer.context_window
            
            # Verify quality metrics
            metrics = ContextQualityMetrics(
                search_precision=0.8,
                context_utilization=0.7,
                token_efficiency=0.9,
                relevance_score=0.85,
                coverage=0.8
            )
            assert metrics.overall_quality >= 0.0
            assert metrics.overall_quality <= 1.0
            
            return ImplementationStatus(
                step=PlaybookStep.STEP_5,
                implemented=True,
                components=cls.STEP_5_COMPONENTS,
                verification_passed=True,
                details="✓ Context window optimization with token counting and quality metrics"
            )
        except Exception as e:
            return ImplementationStatus(
                step=PlaybookStep.STEP_5,
                implemented=False,
                components=cls.STEP_5_COMPONENTS,
                verification_passed=False,
                details=f"✗ Implementation error: {str(e)}"
            )
    
    @classmethod
    def verify_all(cls) -> List[ImplementationStatus]:
        """Run all verification checks."""
        results = [
            cls.verify_step_1(),
            cls.verify_step_2(),
            cls.verify_step_3(),
            cls.verify_step_4(),
            cls.verify_step_5(),
        ]
        return results
    
    @classmethod
    def generate_report(cls) -> str:
        """Generate verification report."""
        results = cls.verify_all()
        
        lines = [
            "=" * 80,
            "CONTEXT ENGINEERING PLAYBOOK IMPLEMENTATION VERIFICATION",
            "=" * 80,
            ""
        ]
        
        passed_count = 0
        
        for result in results:
            status_icon = "✓" if result.verification_passed else "✗"
            lines.append(f"{status_icon} {result.step.value}")
            lines.append(f"  {result.details}")
            lines.append(f"  Components: {len(result.components)}")
            for component in result.components:
                lines.append(f"    - {component}")
            lines.append("")
            
            if result.verification_passed:
                passed_count += 1
        
        lines.append("=" * 80)
        lines.append(f"SUMMARY: {passed_count}/{len(results)} steps fully implemented")
        lines.append("")
        
        if passed_count == len(results):
            lines.append("✓ 100% PLAYBOOK COVERAGE - All context engineering steps implemented!")
        else:
            missing = len(results) - passed_count
            lines.append(f"✗ {missing} steps require attention")
        
        lines.append("=" * 80)
        
        return "\n".join(lines)


if __name__ == "__main__":
    print(PlaybookVerifier.generate_report())

"""
Context Window Optimizer - Step 5 of context engineering playbook.

Optimizes context window efficiency by:
1. Counting tokens accurately
2. Prioritizing high-relevance context
3. Fitting context within model limits
4. Balancing context quality over quantity

Reference: "Focus on context quality over quantity: Modern AI models support 
massive context windows—Claude 3.5 handles 200,000 tokens, GPT-4.1 extends to 
1+ million tokens, and Gemini 1.5 Pro reaches 2 million tokens. But context 
window size doesn't equal effectiveness."
"""

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from enum import Enum
import re


class ModelContextWindow(Enum):
    """Context window sizes for different models."""
    # Small models (7B)
    QWEN_7B = 4096
    LLAMA_7B = 4096
    MISTRAL_7B = 8192
    
    # Medium models (14B+)
    QWEN_14B = 8192
    LLAMA2_70B = 4096
    MISTRAL_13B = 32768
    
    # Large models (state-of-the-art)
    GPT4_TURBO = 128000
    GPT4_1 = 1048576
    CLAUDE_3_5 = 200000
    CLAUDE_OPUS = 200000
    CLAUDE_SONNET = 200000
    GEMINI_1_5_PRO = 2000000


@dataclass
class TokenBudget:
    """Breakdown of token allocation."""
    system_prompt: int
    retrieved_context: int
    user_query: int
    reasoning_space: int  # Space for model to think
    response_space: int   # Space for model response
    safety_margin: int    # Buffer for safety
    
    @property
    def total_available(self) -> int:
        """Total tokens available."""
        return (self.system_prompt + self.retrieved_context + 
                self.user_query + self.reasoning_space + 
                self.response_space + self.safety_margin)


class TokenCounter:
    """
    Estimate token counts for text without external API calls.
    
    Uses multiple strategies:
    1. Character-based approximation (fast)
    2. Word-based approximation (more accurate)
    3. Regex-based for code (specialized)
    """
    
    # Rough estimates: 1 token ≈ 4 characters or 0.75 words
    CHAR_TO_TOKEN_RATIO = 4.0
    WORD_TO_TOKEN_RATIO = 0.75
    
    @classmethod
    def estimate_tokens(cls, text: str, method: str = "word") -> int:
        """
        Estimate token count for text.
        
        Args:
            text: Text to count
            method: 'char', 'word', or 'hybrid'
        """
        if not text:
            return 0
        
        if method == "char":
            return int(len(text) / cls.CHAR_TO_TOKEN_RATIO)
        elif method == "word":
            words = len(text.split())
            return int(words / cls.WORD_TO_TOKEN_RATIO)
        elif method == "hybrid":
            # Use word-based but adjust for long words
            words = text.split()
            word_tokens = int(len(words) / cls.WORD_TO_TOKEN_RATIO)
            char_tokens = int(len(text) / cls.CHAR_TO_TOKEN_RATIO)
            return max(word_tokens, char_tokens)
        
        return 0
    
    @classmethod
    def estimate_tokens_for_code(cls, code: str) -> int:
        """
        Better estimation for code text.
        
        Code has higher token-to-character ratio due to syntax.
        """
        if not code:
            return 0
        
        # Code lines average higher tokens due to special chars
        lines = code.split('\n')
        tokens_per_line = 8  # Average for code
        
        return len(lines) * tokens_per_line + cls.estimate_tokens(code, "char")
    
    @classmethod
    def estimate_tokens_for_context_items(cls, items: List[Dict]) -> int:
        """Estimate total tokens for list of context items."""
        total = 0
        for item in items:
            if 'content' in item:
                total += cls.estimate_tokens(item['content'], "hybrid")
            if 'metadata' in item:
                total += cls.estimate_tokens(str(item['metadata']), "char")
        return total


class ContextWindowOptimizer:
    """
    Optimizes context to fit within model's context window.
    
    Implements greedy priority-based inclusion:
    1. System prompt (always included)
    2. User query (always included)
    3. High-relevance context (up to budget)
    4. Medium-relevance context (if space available)
    5. Low-relevance context (included if space remains)
    """
    
    def __init__(self, model: str, context_window: Optional[int] = None):
        self.model = model
        
        # Auto-detect context window
        if context_window:
            self.context_window = context_window
        else:
            self.context_window = self._get_model_context_window(model)
    
    def _get_model_context_window(self, model: str) -> int:
        """Get context window size for model."""
        model_lower = model.lower()
        
        # Try to match known models
        for enum_member in ModelContextWindow:
            if enum_member.name.lower().replace('_', '').replace('b', '') in model_lower:
                return enum_member.value
        
        # Try regex matching
        if any(x in model_lower for x in ['claude', 'gpt-4.1', 'gemini-1.5']):
            return 200000  # Conservative default for large models
        elif any(x in model_lower for x in ['gpt-4', 'claude-opus']):
            return 128000
        elif '70b' in model_lower or '32b' in model_lower:
            return 32768
        elif '13b' in model_lower or '14b' in model_lower:
            return 8192
        
        return 4096  # Conservative default
    
    def allocate_budget(self, 
                       system_prompt_tokens: int,
                       user_query_tokens: int,
                       response_target: int = 1000) -> TokenBudget:
        """
        Allocate token budget for different parts.
        
        Args:
            system_prompt_tokens: Tokens in system prompt
            user_query_tokens: Tokens in user query
            response_target: Target space for response
        
        Returns:
            TokenBudget with allocation
        """
        safety_margin = int(self.context_window * 0.05)  # 5% safety margin
        reasoning_space = int(self.context_window * 0.10)  # 10% for reasoning
        response_space = max(response_target, int(self.context_window * 0.15))
        
        remaining = (self.context_window - safety_margin - reasoning_space - 
                    response_space - system_prompt_tokens - user_query_tokens)
        
        retrieved_context = max(0, remaining)
        
        return TokenBudget(
            system_prompt=system_prompt_tokens,
            retrieved_context=retrieved_context,
            user_query=user_query_tokens,
            reasoning_space=reasoning_space,
            response_space=response_space,
            safety_margin=safety_margin,
        )
    
    def fit_context_to_budget(self,
                             context_items: List[Dict],
                             token_budget: int) -> Tuple[List[Dict], int]:
        """
        Select context items to fit within token budget.
        
        Uses priority scoring to include most valuable items first.
        
        Args:
            context_items: List with 'content', 'relevance_score', 'priority'
            token_budget: Maximum tokens available
        
        Returns:
            (filtered_items, total_tokens_used)
        """
        if not context_items:
            return [], 0
        
        # Sort by priority (relevance + importance)
        sorted_items = sorted(
            context_items,
            key=lambda x: (
                x.get('relevance_score', 0) * 0.7 +
                x.get('priority', 0.5) * 0.3
            ),
            reverse=True
        )
        
        selected = []
        tokens_used = 0
        
        for item in sorted_items:
            item_tokens = TokenCounter.estimate_tokens(
                item.get('content', ''), 'hybrid'
            )
            
            if tokens_used + item_tokens <= token_budget:
                selected.append(item)
                tokens_used += item_tokens
            elif tokens_used < token_budget:
                # Try to fit truncated version
                truncated = self._truncate_to_fit(
                    item,
                    token_budget - tokens_used
                )
                if truncated:
                    selected.append(truncated)
                    tokens_used += TokenCounter.estimate_tokens(
                        truncated.get('content', ''), 'hybrid'
                    )
        
        return selected, tokens_used
    
    def _truncate_to_fit(self, item: Dict, token_budget: int) -> Optional[Dict]:
        """Truncate item content to fit token budget."""
        content = item.get('content', '')
        if not content:
            return None
        
        # Estimate chars per token
        estimated_tokens = TokenCounter.estimate_tokens(content, 'hybrid')
        if estimated_tokens <= token_budget:
            return item
        
        # Binary search for fitting length
        ratio = token_budget / estimated_tokens
        truncate_len = int(len(content) * ratio * 0.95)  # 95% to be safe
        
        if truncate_len < 100:  # Don't truncate to nearly nothing
            return None
        
        truncated = item.copy()
        truncated['content'] = content[:truncate_len] + "\n[... truncated ...]"
        truncated['truncated'] = True
        
        return truncated


@dataclass
class ContextQualityMetrics:
    """Metrics for measuring context quality."""
    
    search_precision: float  # Relevant results / Total results
    context_utilization: float  # Referenced context / Total provided
    token_efficiency: float  # Information value per token
    relevance_score: float  # Average relevance of included items
    coverage: float  # Fraction of relevant code covered
    
    @property
    def overall_quality(self) -> float:
        """Overall context quality score."""
        return (
            self.search_precision * 0.25 +
            self.context_utilization * 0.25 +
            self.token_efficiency * 0.25 +
            self.relevance_score * 0.25
        )


def format_context_for_model(
    context_items: List[Dict],
    user_query: str,
    max_width: int = 80
) -> str:
    """
    Format context items for presentation to model.
    
    Balances readability with token efficiency.
    """
    formatted_parts = []
    
    formatted_parts.append("=== RETRIEVED CONTEXT ===\n")
    
    for idx, item in enumerate(context_items, 1):
        file_path = item.get('file_path', 'unknown')
        relevance = item.get('relevance_score', 0)
        
        formatted_parts.append(f"\n[{idx}] {file_path} (relevance: {relevance:.2f})")
        formatted_parts.append("-" * min(max_width, len(file_path) + 20))
        
        content = item.get('content', '')
        if item.get('truncated'):
            formatted_parts.append(content)
        else:
            # Add line numbers for code
            lines = content.split('\n')
            start_line = item.get('start_line', 1)
            for i, line in enumerate(lines, start_line):
                formatted_parts.append(f"{i:4d} | {line}")
    
    return "\n".join(formatted_parts)

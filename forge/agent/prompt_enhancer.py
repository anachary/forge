"""
Prompt enhancement with intent classification.

Classifies user intent to determine optimal context retrieval strategy.
Based on: "Intent Classification" approaches in NLU systems.
"""

import re
from enum import Enum
from typing import Tuple, Dict
from dataclasses import dataclass


class QueryIntent(Enum):
    """Classification of user query intent."""
    CODE_EXPLAIN = "explain"      # Explain code
    CODE_WRITE = "write"          # Generate code
    CODE_FIX = "fix"              # Fix bug/error
    CODE_REFACTOR = "refactor"    # Improve code
    CODEBASE_SEARCH = "search"    # Find in codebase
    EXTERNAL_INFO = "external"    # Need web search
    COMPARISON = "compare"        # Compare options
    GENERAL = "general"           # General chat


@dataclass
class ContextBudget:
    """Token budget for different context sources."""
    codebase: int = 3000
    web: int = 1000
    git: int = 500
    
    @classmethod
    def for_model(cls, model: str) -> 'ContextBudget':
        """Adjust budget based on model context window."""
        # Large context models (Claude, GPT-4)
        if any(x in model.lower() for x in ['claude', 'gpt-4', 'opus', 'sonnet']):
            return cls(codebase=8000, web=2000, git=1000)
        # Medium models (14B+)
        elif any(x in model.lower() for x in ['14b', '32b', '70b']):
            return cls(codebase=4000, web=1000, git=500)
        # Small models (7B)
        else:
            return cls(codebase=2500, web=500, git=300)


class PromptEnhancer:
    """
    Smart prompt enhancement with intent classification.
    
    Rather than always retrieving everything, classifies intent
    and fetches only relevant context. Saves tokens and improves
    response quality.
    
    Reference:
        Similar to intent detection in Rasa, Dialogflow, etc.
    """
    
    # Keywords suggesting external info needed
    EXTERNAL_KEYWORDS = [
        'latest', 'current', 'version', 'compare', 'vs', 'versus',
        'difference between', 'best practice', 'how to install',
        'documentation', 'official', 'release', 'alternative'
    ]
    
    # Keywords suggesting codebase context needed
    CODE_KEYWORDS = [
        'this code', 'this file', 'this function', 'this class',
        'our code', 'where is', 'how does', 'explain', 'refactor',
        'fix', 'bug', 'error', 'implement', 'add feature'
    ]
    
    def __init__(self, model: str = "qwen2.5-coder:7b"):
        self.model = model
        self.budget = ContextBudget.for_model(model)
    
    def classify_intent(self, query: str) -> Tuple[QueryIntent, float]:
        """
        Classify the intent of a user query.
        
        Returns (intent, confidence).
        """
        q = query.lower()
        
        # Pattern matching for specific intents
        if re.search(r'(explain|what does|how does).*(this|the)\s+(code|function|class)', q):
            return QueryIntent.CODE_EXPLAIN, 0.9
        if re.search(r'(fix|debug|error|bug|issue|problem|broken)', q):
            return QueryIntent.CODE_FIX, 0.85
        if re.search(r'(refactor|improve|optimize|clean up|simplify)', q):
            return QueryIntent.CODE_REFACTOR, 0.85
        if re.search(r'(write|create|implement|add|generate|build)\s+', q):
            return QueryIntent.CODE_WRITE, 0.8
        if re.search(r'(where|find|search|locate|show me)\s+', q):
            return QueryIntent.CODEBASE_SEARCH, 0.85
        if re.search(r'(compare|vs|versus|difference|better|choose)', q):
            return QueryIntent.COMPARISON, 0.8
        
        # Keyword scoring fallback
        external_score = sum(1 for kw in self.EXTERNAL_KEYWORDS if kw in q)
        code_score = sum(1 for kw in self.CODE_KEYWORDS if kw in q)
        
        if external_score > code_score and external_score > 0:
            return QueryIntent.EXTERNAL_INFO, 0.6
        if code_score > 0:
            return QueryIntent.CODEBASE_SEARCH, 0.6
        
        return QueryIntent.GENERAL, 0.5
    
    def get_context_strategy(self, intent: QueryIntent) -> Dict[str, bool]:
        """Determine which context sources to use."""
        strategies = {
            QueryIntent.CODE_EXPLAIN: {"codebase": True, "web": False, "git": True},
            QueryIntent.CODE_WRITE: {"codebase": True, "web": False, "git": False},
            QueryIntent.CODE_FIX: {"codebase": True, "web": False, "git": True},
            QueryIntent.CODE_REFACTOR: {"codebase": True, "web": False, "git": False},
            QueryIntent.CODEBASE_SEARCH: {"codebase": True, "web": False, "git": False},
            QueryIntent.EXTERNAL_INFO: {"codebase": False, "web": True, "git": False},
            QueryIntent.COMPARISON: {"codebase": True, "web": True, "git": False},
            QueryIntent.GENERAL: {"codebase": True, "web": False, "git": False},
        }
        return strategies.get(intent, {"codebase": True, "web": False, "git": False})
    
    def should_web_search(self, query: str) -> bool:
        """Quick check if web search would help."""
        intent, confidence = self.classify_intent(query)
        strategy = self.get_context_strategy(intent)
        return strategy.get("web", False) and confidence > 0.5
    
    def truncate_to_budget(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit token budget (estimate: 4 chars = 1 token)."""
        max_chars = max_tokens * 4
        if len(text) <= max_chars:
            return text
        return text[:max_chars] + "\n... (truncated)"


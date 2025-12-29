"""
Context Scope definitions following Step 1 of context engineering playbook.

Defines what information helps vs hurts AI performance for different query types.
Based on: "Prompt Context Analysis: Your Context Engineering Playbook"
"""

from dataclasses import dataclass, field
from typing import List, Set, Dict
from enum import Enum


class QueryComplexity(Enum):
    """Query complexity levels determining context scope."""
    SIMPLE = "simple"              # Function signature, API lookup
    FOCUSED = "focused"            # Single file bug fix, feature implementation
    MODERATE = "moderate"          # Multi-file refactoring
    COMPLEX = "complex"            # Architectural questions
    CROSS_SERVICE = "cross_service"  # Multi-service debugging


@dataclass
class ContextScope:
    """
    Defines context boundaries for a specific query type.
    
    Implements the principle: "Information Overload: Including entire file trees
    degrades performance. Modern research shows that AI models process all 
    information provided, meaning irrelevant context doesn't get ignored—it gets 
    processed, reducing suggestion quality and increasing latency."
    """
    
    query_type: str
    complexity: QueryComplexity
    
    # What to include
    include: List[str] = field(default_factory=list)
    
    # What to exclude  
    exclude: List[str] = field(default_factory=list)
    
    # Token budgets
    max_tokens: int = 50000
    max_files: int = 10
    
    # Features to enable
    enable_call_graph: bool = True
    enable_git_context: bool = True
    enable_web_search: bool = False
    
    # Retrieval strategy
    search_depth: int = 1  # How many degrees of separation in call graph
    git_lookback_days: int = 7  # How far back to look in git history
    min_relevance_score: float = 0.7  # Minimum relevance to include
    
    def should_include(self, file_path: str) -> bool:
        """Check if file should be included in context."""
        # Check exclude patterns first
        for pattern in self.exclude:
            if pattern in file_path:
                return False
        
        # Check include patterns (if specified)
        if self.include:
            return any(pattern in file_path for pattern in self.include)
        
        return True


# Predefined context scopes for common query types
CONTEXT_SCOPES: Dict[QueryComplexity, ContextScope] = {
    
    QueryComplexity.SIMPLE: ContextScope(
        query_type="api_lookup",
        complexity=QueryComplexity.SIMPLE,
        include=["function_signature", "docstring", "type_hints"],
        exclude=[
            "auto_generated",
            "vendor_dependencies",
            "node_modules",
            "__pycache__",
            "test_files"
        ],
        max_tokens=5000,
        max_files=1,
        enable_call_graph=False,
        enable_git_context=False,
        enable_web_search=False,
        search_depth=0,
    ),
    
    QueryComplexity.FOCUSED: ContextScope(
        query_type="bug_fix",
        complexity=QueryComplexity.FOCUSED,
        include=[
            "error_location",
            "service_implementation",
            "related_tests",
            "recent_changes",
            "error_logs"
        ],
        exclude=[
            "auto_generated_files",
            "vendor_dependencies",
            "unrelated_services",
            "historical_logs_beyond_24h",
            "node_modules",
            "dist",
            "build"
        ],
        max_tokens=30000,
        max_files=5,
        enable_call_graph=True,
        enable_git_context=True,
        enable_web_search=False,
        search_depth=2,
        git_lookback_days=7,
        min_relevance_score=0.7,
    ),
    
    QueryComplexity.MODERATE: ContextScope(
        query_type="refactoring",
        complexity=QueryComplexity.MODERATE,
        include=[
            "target_files",
            "dependent_code",
            "tests",
            "api_contracts",
            "documentation",
            "related_components"
        ],
        exclude=[
            "vendor_dependencies",
            "node_modules",
            "dist",
            "build",
            ".git"
        ],
        max_tokens=50000,
        max_files=15,
        enable_call_graph=True,
        enable_git_context=True,
        enable_web_search=False,
        search_depth=3,
        git_lookback_days=30,
        min_relevance_score=0.65,
    ),
    
    QueryComplexity.COMPLEX: ContextScope(
        query_type="architecture",
        complexity=QueryComplexity.COMPLEX,
        include=[
            "architecture_diagrams",
            "service_implementations",
            "api_definitions",
            "database_schemas",
            "design_docs",
            "dependencies",
            "integration_points"
        ],
        exclude=[
            "vendor_dependencies",
            "node_modules",
            "dist",
            "build",
            ".git",
            "temp_files"
        ],
        max_tokens=100000,
        max_files=30,
        enable_call_graph=True,
        enable_git_context=True,
        enable_web_search=True,
        search_depth=4,
        git_lookback_days=90,
        min_relevance_score=0.6,
    ),
    
    QueryComplexity.CROSS_SERVICE: ContextScope(
        query_type="cross_service_debugging",
        complexity=QueryComplexity.CROSS_SERVICE,
        include=[
            "service_boundaries",
            "api_contracts",
            "message_schemas",
            "service_implementations",
            "logs_from_all_services",
            "integration_tests",
            "monitoring_data"
        ],
        exclude=[
            "vendor_dependencies",
            "node_modules",
            "dist",
            "build",
            ".git"
        ],
        max_tokens=150000,
        max_files=50,
        enable_call_graph=True,
        enable_git_context=True,
        enable_web_search=False,
        search_depth=5,
        git_lookback_days=14,
        min_relevance_score=0.55,
    ),
}


class SecurityContextFilter:
    """
    Implements security context filtering per the playbook.
    
    Prevents context leakage of sensitive data like credentials.
    
    Reference: "88% of CISOs express concern about AI tool security.
    Context systems can expose sensitive data through expanded search scope.
    Implement access controls that respect existing repository permissions."
    """
    
    # Patterns for sensitive files
    EXCLUDE_PATTERNS = [
        r'\.env(\.|$)',
        r'config/secrets',
        r'\.key$',
        r'credentials',
        r'private_key',
        r'password',
        r'api_key',
        r'secret',
        r'token',
    ]
    
    # Sensitive file extensions
    SENSITIVE_EXTENSIONS = {".pem", ".key", ".env", ".pfx", ".jks", ".p12"}
    
    # Sensitive keywords to scan for
    CREDENTIAL_KEYWORDS = [
        "aws_access_key",
        "aws_secret_key",
        "jwt_secret",
        "api_token",
        "bearer_token",
        "github_token",
        "stripe_key",
        "database_password",
    ]
    
    @classmethod
    def is_sensitive_file(cls, file_path: str) -> bool:
        """Check if file contains sensitive data."""
        import re
        
        # Check extensions
        for ext in cls.SENSITIVE_EXTENSIONS:
            if file_path.endswith(ext):
                return True
        
        # Check patterns
        for pattern in cls.EXCLUDE_PATTERNS:
            if re.search(pattern, file_path, re.IGNORECASE):
                return True
        
        return False
    
    @classmethod
    def scan_content_for_credentials(cls, content: str) -> bool:
        """Scan content for credential-like patterns."""
        for keyword in cls.CREDENTIAL_KEYWORDS:
            if keyword.lower() in content.lower():
                return True
        
        # Check for common secret patterns
        if any(pattern in content for pattern in [
            "-----BEGIN PRIVATE KEY-----",
            "-----BEGIN RSA PRIVATE KEY-----",
            "-----BEGIN CERTIFICATE-----",
        ]):
            return True
        
        return False


def get_scope_for_complexity(complexity: QueryComplexity) -> ContextScope:
    """Get the appropriate context scope for a query complexity level."""
    return CONTEXT_SCOPES.get(
        complexity,
        CONTEXT_SCOPES[QueryComplexity.FOCUSED]  # Default fallback
    )


def get_scope_for_intent(intent_type: str, complexity: QueryComplexity) -> ContextScope:
    """Get context scope based on intent type and complexity."""
    # Get base scope for complexity
    scope = get_scope_for_complexity(complexity)
    
    # Override based on specific intent if needed
    if intent_type == "web_search":
        scope.enable_web_search = True
    elif intent_type == "explanation":
        scope.search_depth = 2
    elif intent_type == "security_review":
        # For security reviews, include everything but run through security filter
        scope.max_tokens = 200000
        scope.max_files = 100
    
    return scope

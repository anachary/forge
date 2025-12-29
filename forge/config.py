"""
Configuration management for Forge.
"""

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ForgeConfig:
    """Main configuration for Forge."""

    # Provider Settings
    provider: str = "ollama"  # "ollama" | "claude" | "openai"
    embedding_provider: str = "sentence-transformers"  # "sentence-transformers" | "ollama"

    # LLM Settings (Ollama)
    ollama_url: str = "http://localhost:11434"
    model: str = "qwen2.5-coder:7b"
    embedding_model: str = "nomic-embed-text"
    temperature: float = 0.7
    max_tokens: int = 4096

    # Anthropic (Claude) Settings
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"

    # OpenAI Settings
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    
    # Context Settings
    max_context_tokens: int = 4000
    chunk_size: int = 512
    chunk_overlap: int = 50
    
    # Context Engineering (Playbook Implementation)
    # Step 1: Context Boundaries
    context_scoping_enabled: bool = True
    
    # Step 4: Query Complexity Routing
    complexity_routing_enabled: bool = True
    
    # Step 5: Context Window Optimization
    context_window_optimization_enabled: bool = True
    
    # Security
    security_filtering_enabled: bool = True
    
    # Quality Metrics
    quality_metrics_enabled: bool = True
    
    # Workspace
    workspace: Optional[Path] = None
    
    # Feature Flags
    enable_web_search: bool = True
    enable_call_graph: bool = True
    enable_git_context: bool = True
    auto_mode: bool = False
    
    @classmethod
    def from_env(cls) -> 'ForgeConfig':
        """Load config from environment variables."""
        return cls(
            provider=os.getenv("FORGE_PROVIDER", "ollama"),
            embedding_provider=os.getenv("FORGE_EMBEDDING_PROVIDER", "sentence-transformers"),
            ollama_url=os.getenv("FORGE_OLLAMA_URL", "http://localhost:11434"),
            model=os.getenv("FORGE_MODEL", "qwen2.5-coder:7b"),
            embedding_model=os.getenv("FORGE_EMBED_MODEL", "nomic-embed-text"),
            temperature=float(os.getenv("FORGE_TEMPERATURE", "0.7")),
            max_tokens=int(os.getenv("FORGE_MAX_TOKENS", "4096")),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            claude_model=os.getenv("FORGE_CLAUDE_MODEL", "claude-sonnet-4-20250514"),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("FORGE_OPENAI_MODEL", "gpt-4o"),
        )


def check_dependencies() -> dict:
    """Check if critical dependencies are installed.

    Returns dict of {package_name: (installed: bool, purpose: str)}.
    Prints warnings for missing packages.
    """
    deps = {}

    try:
        import lancedb
        deps["lancedb"] = (True, "vector database")
    except ImportError:
        deps["lancedb"] = (False, "vector database")

    try:
        import tree_sitter_languages
        deps["tree-sitter-languages"] = (True, "semantic code chunking")
    except ImportError:
        deps["tree-sitter-languages"] = (False, "semantic code chunking")

    try:
        import numpy
        deps["numpy"] = (True, "numerical operations")
    except ImportError:
        deps["numpy"] = (False, "numerical operations")

    try:
        from bs4 import BeautifulSoup
        deps["beautifulsoup4"] = (True, "web search")
    except ImportError:
        deps["beautifulsoup4"] = (False, "web search")

    if config.embedding_provider == "sentence-transformers":
        try:
            import sentence_transformers
            deps["sentence-transformers"] = (True, "local embeddings")
        except ImportError:
            deps["sentence-transformers"] = (False, "local embeddings")

    missing = {k: v for k, v in deps.items() if not v[0]}
    if missing:
        print("⚠️  Missing dependencies (indexing will not work):")
        for pkg, (_, purpose) in missing.items():
            print(f"   - {pkg} ({purpose})")
        print(f"   Run: pip install {' '.join(missing.keys())}")

    return deps


# Global config instance
config = ForgeConfig.from_env()


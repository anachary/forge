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
    
    # LLM Settings
    ollama_url: str = "http://localhost:11434"
    model: str = "qwen2.5-coder:7b"
    embedding_model: str = "nomic-embed-text"
    temperature: float = 0.7
    max_tokens: int = 4096
    
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
            ollama_url=os.getenv("FORGE_OLLAMA_URL", "http://localhost:11434"),
            model=os.getenv("FORGE_MODEL", "qwen2.5-coder:7b"),
            embedding_model=os.getenv("FORGE_EMBED_MODEL", "nomic-embed-text"),
            temperature=float(os.getenv("FORGE_TEMPERATURE", "0.7")),
            max_tokens=int(os.getenv("FORGE_MAX_TOKENS", "4096")),
        )


# Global config instance
config = ForgeConfig.from_env()


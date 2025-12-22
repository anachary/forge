"""
File manipulation tools for the agent.

Safe file operations with validation.
"""

import os
import difflib
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass


@dataclass
class FileDiff:
    """A file diff."""
    path: str
    original: str
    modified: str
    unified_diff: str


class FileTools:
    """
    Safe file operations for agentic use.
    
    Features:
    - Path validation (stay within workspace)
    - Diff generation before writes
    - Backup on modification
    """
    
    def __init__(self, workspace: str):
        self.workspace = Path(workspace).resolve()
    
    def _validate_path(self, path: str) -> Path:
        """Ensure path is within workspace."""
        full_path = (self.workspace / path).resolve()
        
        if not str(full_path).startswith(str(self.workspace)):
            raise ValueError(f"Path escapes workspace: {path}")
        
        return full_path
    
    def read(self, path: str, max_lines: Optional[int] = None) -> str:
        """Read a file's contents."""
        full_path = self._validate_path(path)
        
        if not full_path.exists():
            return f"Error: File not found: {path}"
        
        try:
            content = full_path.read_text(encoding="utf-8", errors="ignore")
            
            if max_lines:
                lines = content.split("\n")
                if len(lines) > max_lines:
                    content = "\n".join(lines[:max_lines])
                    content += f"\n... ({len(lines) - max_lines} more lines)"
            
            return content
        except Exception as e:
            return f"Error reading file: {e}"
    
    def write(self, path: str, content: str, create_dirs: bool = True) -> str:
        """Write content to a file."""
        full_path = self._validate_path(path)
        
        try:
            if create_dirs:
                full_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Backup existing file
            if full_path.exists():
                backup_path = full_path.with_suffix(full_path.suffix + ".bak")
                backup_path.write_text(
                    full_path.read_text(encoding="utf-8", errors="ignore"),
                    encoding="utf-8"
                )
            
            full_path.write_text(content, encoding="utf-8")
            return f"Successfully wrote to {path}"
        except Exception as e:
            return f"Error writing file: {e}"
    
    def diff(self, path: str, new_content: str) -> FileDiff:
        """Generate a diff between current and new content."""
        full_path = self._validate_path(path)
        
        if full_path.exists():
            original = full_path.read_text(encoding="utf-8", errors="ignore")
        else:
            original = ""
        
        diff_lines = difflib.unified_diff(
            original.splitlines(keepends=True),
            new_content.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
        
        return FileDiff(
            path=path,
            original=original,
            modified=new_content,
            unified_diff="".join(diff_lines),
        )
    
    def list_files(self, path: str = ".", pattern: str = "*") -> List[str]:
        """List files in a directory."""
        full_path = self._validate_path(path)
        
        if not full_path.exists():
            return []
        
        if not full_path.is_dir():
            return [str(full_path.relative_to(self.workspace))]
        
        files = []
        for f in full_path.rglob(pattern):
            if f.is_file():
                rel_path = str(f.relative_to(self.workspace))
                # Skip hidden and common ignore patterns
                if not any(p.startswith('.') for p in Path(rel_path).parts):
                    if 'node_modules' not in rel_path and '__pycache__' not in rel_path:
                        files.append(rel_path)
        
        return sorted(files)[:100]  # Limit results
    
    def exists(self, path: str) -> bool:
        """Check if a file exists."""
        try:
            full_path = self._validate_path(path)
            return full_path.exists()
        except:
            return False


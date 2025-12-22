"""
Git history context for understanding code evolution.

Extracts context from git history:
- Recent changes
- File experts (who knows this code)
- Related files (often changed together)

Based on: "Mining Version Histories to Guide Software Changes" (Zimmermann et al., 2005)
"""

import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from collections import defaultdict


@dataclass
class Commit:
    """A git commit."""
    hash: str
    author: str
    date: str
    message: str
    files: List[str]


@dataclass
class FileHistory:
    """History information for a file."""
    path: str
    total_commits: int
    last_modified: str
    top_contributors: List[Tuple[str, int]]


class GitContext:
    """
    Extract context from git history.
    
    Git history provides valuable signals:
    - Files often changed together are likely related
    - Recent changes are relevant context
    - Commit messages explain why changes were made
    
    Reference:
        Zimmermann, T., et al. (2005). Mining Version Histories to Guide 
        Software Changes. IEEE TSE.
    """
    
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        self._is_git_repo = (self.workspace / ".git").exists()
    
    def _run_git(self, *args) -> Optional[str]:
        """Run a git command and return output."""
        if not self._is_git_repo:
            return None
        
        try:
            result = subprocess.run(
                ["git"] + list(args),
                cwd=self.workspace,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except:
            pass
        return None
    
    def get_recent_commits(self, limit: int = 10) -> List[Commit]:
        """Get recent commits."""
        output = self._run_git(
            "log", f"-{limit}", 
            "--pretty=format:%H|%an|%ad|%s",
            "--date=short",
            "--name-only"
        )
        
        if not output:
            return []
        
        commits = []
        current_commit = None
        current_files = []
        
        for line in output.split("\n"):
            if "|" in line and len(line.split("|")) >= 4:
                if current_commit:
                    current_commit.files = current_files
                    commits.append(current_commit)
                
                parts = line.split("|")
                current_commit = Commit(
                    hash=parts[0],
                    author=parts[1],
                    date=parts[2],
                    message="|".join(parts[3:]),
                    files=[],
                )
                current_files = []
            elif line.strip() and current_commit:
                current_files.append(line.strip())
        
        if current_commit:
            current_commit.files = current_files
            commits.append(current_commit)
        
        return commits
    
    def get_file_history(self, file_path: str, limit: int = 5) -> List[Commit]:
        """Get commit history for a specific file."""
        output = self._run_git(
            "log", f"-{limit}",
            "--pretty=format:%H|%an|%ad|%s",
            "--date=short",
            "--", file_path
        )
        
        if not output:
            return []
        
        return [
            Commit(
                hash=parts[0],
                author=parts[1],
                date=parts[2],
                message="|".join(parts[3:]),
                files=[file_path],
            )
            for line in output.split("\n")
            if line.strip()
            for parts in [line.split("|")]
            if len(parts) >= 4
        ]
    
    def get_related_files(self, file_path: str, limit: int = 10) -> List[Tuple[str, int]]:
        """Find files often changed together with this file."""
        commits = self.get_file_history(file_path, limit=50)
        
        co_changes: Dict[str, int] = defaultdict(int)
        for commit in commits:
            for f in commit.files:
                if f != file_path:
                    co_changes[f] += 1
        
        return sorted(co_changes.items(), key=lambda x: -x[1])[:limit]
    
    def get_file_experts(self, file_path: str) -> List[Tuple[str, int]]:
        """Get contributors who have modified this file most."""
        output = self._run_git("shortlog", "-sn", "--", file_path)
        
        if not output:
            return []
        
        experts = []
        for line in output.split("\n"):
            if line.strip():
                parts = line.strip().split("\t")
                if len(parts) >= 2:
                    experts.append((parts[1], int(parts[0].strip())))
        
        return experts
    
    def get_recent_context(self, limit: int = 5) -> str:
        """Get formatted context string of recent changes."""
        commits = self.get_recent_commits(limit)
        
        if not commits:
            return ""
        
        lines = ["Recent git history:"]
        for c in commits:
            lines.append(f"- [{c.date}] {c.message} ({c.author})")
            if c.files:
                lines.append(f"  Files: {', '.join(c.files[:5])}")
        
        return "\n".join(lines)


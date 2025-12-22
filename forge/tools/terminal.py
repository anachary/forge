"""
Terminal/shell command execution.

Safe command execution with output capture.
"""

import subprocess
import shlex
from pathlib import Path
from typing import Optional, Tuple
from dataclasses import dataclass


@dataclass
class CommandResult:
    """Result of command execution."""
    command: str
    exit_code: int
    stdout: str
    stderr: str
    success: bool


class Terminal:
    """
    Safe terminal command execution.
    
    Features:
    - Timeout protection
    - Output capture
    - Working directory management
    - Auto-mode for safe commands
    """
    
    # Commands safe to auto-execute in auto mode
    SAFE_COMMANDS = [
        "ls", "dir", "pwd", "cat", "head", "tail", "grep", "find",
        "git status", "git log", "git diff", "git branch",
        "npm list", "pip list", "python --version", "node --version",
    ]
    
    # Commands that need confirmation
    DANGEROUS_PATTERNS = [
        "rm ", "del ", "rmdir", "format", "mkfs",
        "drop ", "delete ", "truncate",
        "> ", ">>",  # Redirects
        "sudo", "su ",
    ]
    
    def __init__(self, workspace: str, auto_mode: bool = False):
        self.workspace = Path(workspace)
        self.auto_mode = auto_mode
    
    def run(
        self,
        command: str,
        timeout: int = 30,
        cwd: Optional[str] = None,
    ) -> CommandResult:
        """Run a command and capture output."""
        work_dir = Path(cwd) if cwd else self.workspace
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            
            return CommandResult(
                command=command,
                exit_code=result.returncode,
                stdout=result.stdout[:10000],  # Limit output
                stderr=result.stderr[:5000],
                success=result.returncode == 0,
            )
        except subprocess.TimeoutExpired:
            return CommandResult(
                command=command,
                exit_code=-1,
                stdout="",
                stderr=f"Command timed out after {timeout}s",
                success=False,
            )
        except Exception as e:
            return CommandResult(
                command=command,
                exit_code=-1,
                stdout="",
                stderr=str(e),
                success=False,
            )
    
    def is_safe(self, command: str) -> bool:
        """Check if a command is safe to auto-execute."""
        cmd_lower = command.lower().strip()
        
        # Check for dangerous patterns
        for pattern in self.DANGEROUS_PATTERNS:
            if pattern in cmd_lower:
                return False
        
        # Check if it's a known safe command
        for safe in self.SAFE_COMMANDS:
            if cmd_lower.startswith(safe):
                return True
        
        return False
    
    def should_auto_execute(self, command: str) -> bool:
        """Check if command should auto-execute in auto mode."""
        return self.auto_mode and self.is_safe(command)
    
    def run_safe(self, command: str, timeout: int = 30) -> Tuple[bool, str]:
        """
        Run a command with safety checks.
        
        Returns (executed, result_or_warning).
        """
        if not self.is_safe(command):
            return False, f"Command requires confirmation: {command}"
        
        result = self.run(command, timeout)
        
        if result.success:
            return True, result.stdout
        else:
            return True, f"Error: {result.stderr}"


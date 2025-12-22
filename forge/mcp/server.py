"""
MCP (Model Context Protocol) Server.

Exposes Forge tools via the MCP protocol for use with Claude Desktop,
VS Code extensions, and other MCP clients.

Based on: Anthropic's Model Context Protocol specification.
"""

import json
import sys
from typing import Dict, Any, List, Optional
from pathlib import Path

from forge.tools.file_tools import FileTools
from forge.tools.terminal import Terminal
from forge.tools.web_search import WebSearch
from forge.context.retriever import ContextRetriever


class MCPServer:
    """
    MCP Tool Server for Forge.
    
    Exposes these tools via MCP:
    - read_file: Read file contents
    - write_file: Write to a file
    - search_codebase: Semantic code search
    - run_command: Execute shell commands
    - web_search: Search the web
    
    Reference:
        https://modelcontextprotocol.io/
    """
    
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        
        # Initialize tools
        self.files = FileTools(workspace)
        self.terminal = Terminal(workspace)
        self.web = WebSearch()
        self.retriever = ContextRetriever(workspace)
    
    def get_tools(self) -> List[Dict[str, Any]]:
        """Return tool definitions in MCP format."""
        return [
            {
                "name": "read_file",
                "description": "Read the contents of a file",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File path relative to workspace"},
                        "max_lines": {"type": "integer", "description": "Maximum lines to read"},
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "write_file",
                "description": "Write content to a file",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File path"},
                        "content": {"type": "string", "description": "Content to write"},
                    },
                    "required": ["path", "content"],
                },
            },
            {
                "name": "search_codebase",
                "description": "Search the codebase semantically",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "max_results": {"type": "integer", "description": "Max results", "default": 5},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "run_command",
                "description": "Run a shell command",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "command": {"type": "string", "description": "Command to run"},
                        "timeout": {"type": "integer", "description": "Timeout in seconds", "default": 30},
                    },
                    "required": ["command"],
                },
            },
            {
                "name": "web_search",
                "description": "Search the web for information",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "max_results": {"type": "integer", "description": "Max results", "default": 5},
                    },
                    "required": ["query"],
                },
            },
        ]
    
    def call_tool(self, name: str, arguments: Dict[str, Any]) -> str:
        """Execute a tool and return result."""
        if name == "read_file":
            return self.files.read(
                arguments["path"],
                max_lines=arguments.get("max_lines"),
            )
        
        elif name == "write_file":
            return self.files.write(
                arguments["path"],
                arguments["content"],
            )
        
        elif name == "search_codebase":
            ctx = self.retriever.retrieve(
                arguments["query"],
                max_results=arguments.get("max_results", 5),
            )
            return ctx.formatted
        
        elif name == "run_command":
            result = self.terminal.run(
                arguments["command"],
                timeout=arguments.get("timeout", 30),
            )
            if result.success:
                return result.stdout
            else:
                return f"Error (exit {result.exit_code}): {result.stderr}"
        
        elif name == "web_search":
            return self.web.search_formatted(
                arguments["query"],
                max_results=arguments.get("max_results", 5),
            )
        
        else:
            return f"Unknown tool: {name}"
    
    def run_stdio(self):
        """Run the MCP server over stdio."""
        # Initialize retriever
        self.retriever.index()
        
        for line in sys.stdin:
            try:
                request = json.loads(line)
                method = request.get("method")
                
                if method == "tools/list":
                    response = {"tools": self.get_tools()}
                elif method == "tools/call":
                    params = request.get("params", {})
                    result = self.call_tool(params.get("name"), params.get("arguments", {}))
                    response = {"content": [{"type": "text", "text": result}]}
                else:
                    response = {"error": f"Unknown method: {method}"}
                
                print(json.dumps(response), flush=True)
            except Exception as e:
                print(json.dumps({"error": str(e)}), flush=True)


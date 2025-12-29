"""
Forge Agent - The main agentic coding assistant.

Combines:
- Context retrieval (RAG)
- Tool use (MCP)
- Intent classification
- Streaming responses

Based on: "ReAct: Synergizing Reasoning and Acting in Language Models" (Yao et al., 2022)
"""

import json
import re
from typing import Generator, Optional, List, Dict
from pathlib import Path

from forge.config import config
from forge.context.retriever import ContextRetriever
from forge.tools.web_search import WebSearch
from .llm import LLM, Message
from .prompt_enhancer import PromptEnhancer, QueryIntent


SYSTEM_PROMPT = """You are Forge, an expert coding assistant.

You have access to:
1. The user's codebase (via semantic search)
2. Call graph analysis (understanding code relationships)
3. Git history (recent changes)
4. Web search (for external information)

When helping with code:
- Be precise and accurate
- Use the provided context
- Explain your reasoning
- Suggest tests when appropriate

If you need to perform an action, respond with a tool call:
```json
{"tool": "tool_name", "args": {"arg1": "value1"}}
```

Available tools:
- read_file: Read a file's contents
- write_file: Write content to a file
- run_command: Execute a shell command
- search_codebase: Search for code semantically
- web_search: Search the web for information
"""


class ForgeAgent:
    """
    The main Forge agent - agentic AI for coding.
    
    Implements the ReAct pattern:
    1. Reason about the task
    2. Act using tools
    3. Observe results
    4. Repeat until done
    
    Reference:
        Yao, S., et al. (2022). ReAct: Synergizing Reasoning and Acting 
        in Language Models. ICLR.
    """
    
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        
        # Core components
        self.llm = LLM()
        self.retriever = ContextRetriever(workspace)
        self.enhancer = PromptEnhancer(config.model)
        self.web_search = WebSearch()
        
        # State
        self.history: List[Message] = []
        self._initialized = False
        
        # Auto-initialize when workspace opens
        self._auto_initialize()
    
    def initialize(self, force: bool = False):
        """Initialize the agent (index codebase, build call graph).

        Args:
            force: If True, re-index even if cached index exists
        """
        if self._initialized and not force:
            return

        # Check dependencies before indexing
        from forge.config import check_dependencies
        deps = check_dependencies()
        missing = {k for k, (installed, _) in deps.items() if not installed}
        if missing:
            print("⚠️  Cannot index codebase - install missing dependencies first")
            return

        print("Initializing Forge...")
        print("  Indexing codebase...")
        self.retriever.index(force=force)

        # Only save cache if indexing actually stored data
        chunk_count = self.retriever.vector_store.count()
        if chunk_count > 0:
            self._save_index_metadata()
            self._initialized = True
            print(f"✅ Ready! ({chunk_count} chunks indexed)")
        else:
            print("⚠️  Indexing produced no results - cache NOT saved")
            if config.embedding_provider == "ollama":
                print("   Check that Ollama is running: ollama serve")
            else:
                print(f"   Check embedding provider: {config.embedding_provider}")
    
    def _auto_initialize(self):
        """Auto-initialize agent when workspace is opened.
        
        Checks if codebase has been indexed before:
        - If not indexed: Index now (first time)
        - If already indexed: Skip (reuse cached index)
        - If codebase changed: Re-index automatically
        """
        try:
            # Check if we have a cached index for this workspace
            cache_path = self.workspace / ".forge" / "index_cache"
            index_exists = cache_path.exists()
            
            if not index_exists:
                print(f"📦 New codebase detected: {self.workspace.name}")
                print("   Indexing for the first time...")
                self.initialize(force=False)
            else:
                # Check if codebase has changed since last index
                if self._has_codebase_changed():
                    print(f"🔄 Codebase changed, re-indexing {self.workspace.name}...")
                    self.initialize(force=True)
                else:
                    print(f"✅ Using cached index for {self.workspace.name}")
                    self._initialized = True
        except Exception as e:
            print(f"⚠️  Auto-initialization warning: {e}")
            print("   You can manually call agent.initialize()")
    
    def _has_codebase_changed(self) -> bool:
        """Check if codebase has changed since last index.

        Compares:
        - Number of Python files
        - Last modified timestamps
        - Embedding provider (different providers produce incompatible vectors)

        Returns:
            True if codebase has changed, False otherwise
        """
        try:
            cache_meta = self.workspace / ".forge" / "index_metadata.json"

            if not cache_meta.exists():
                return True

            # Get cached file stats
            cached_meta = json.loads(cache_meta.read_text())

            # Check if embedding provider changed (vectors would be incompatible)
            cached_provider = cached_meta.get("embedding_provider", "ollama")
            if cached_provider != config.embedding_provider:
                print(f"   Embedding provider changed: {cached_provider} → {config.embedding_provider}")
                # Clear stale vectors with wrong dimensions
                self.retriever.vector_store.clear()
                return True

            # Get current file stats
            current_files = list(self.workspace.rglob("*.py"))
            current_count = len(current_files)
            current_mtime = max(
                (f.stat().st_mtime for f in current_files),
                default=0
            )

            cached_count = cached_meta.get("file_count", 0)
            cached_mtime = cached_meta.get("last_modified", 0)

            # If file count changed or modification time changed, re-index
            changed = current_count != cached_count or current_mtime > cached_mtime

            if changed:
                print(f"   (Files: {cached_count} → {current_count})")

            return changed
        except Exception:
            # If we can't determine, be safe and don't re-index
            return False
    
    def _save_index_metadata(self):
        """Save index metadata for change detection.
        
        Stores:
        - Number of Python files
        - Last modification timestamp
        - Index creation time
        - Workspace path
        """
        try:
            from datetime import datetime
            
            # Create .forge directory
            forge_dir = self.workspace / ".forge"
            forge_dir.mkdir(exist_ok=True)
            
            # Create empty index_cache file to mark indexed status
            cache_file = forge_dir / "index_cache"
            cache_file.touch()
            
            # Get current file stats
            current_files = list(self.workspace.rglob("*.py"))
            
            metadata = {
                "file_count": len(current_files),
                "last_modified": max(
                    (f.stat().st_mtime for f in current_files),
                    default=0
                ),
                "indexed_at": datetime.now().isoformat(),
                "workspace": str(self.workspace),
                "embedding_provider": config.embedding_provider,
            }
            
            # Save metadata
            meta_file = forge_dir / "index_metadata.json"
            meta_file.write_text(json.dumps(metadata, indent=2))
            
        except Exception as e:
            print(f"⚠️  Could not save index metadata: {e}")
    
    def chat(self, message: str) -> str:
        """Process a chat message and return response."""
        self.history.append(Message(role="user", content=message))
        
        # Classify intent and get context strategy
        intent, confidence = self.enhancer.classify_intent(message)
        strategy = self.enhancer.get_context_strategy(intent)
        budget = self.enhancer.budget
        
        # Build context based on strategy
        context_parts = []
        
        # Codebase context
        if strategy.get("codebase", True):
            ctx = self.retriever.retrieve(
                message,
                max_results=5,
                include_call_graph=True,
                include_git=strategy.get("git", False),
            )
            if ctx.formatted and ctx.formatted != "(No relevant context found)":
                context_parts.append(ctx.formatted)
        
        # Web search
        if strategy.get("web", False):
            web_results = self.web_search.search_formatted(message, max_results=3)
            if web_results and "No web results" not in web_results:
                context_parts.append(f"### Web Search\n{web_results}")
        
        # Assemble prompt
        context = "\n\n".join(context_parts) if context_parts else "(No additional context)"
        context = self.enhancer.truncate_to_budget(context, budget.codebase + budget.web)
        
        prompt = f"""## Context
{context}

## User Request
{message}

## Instructions
Use the context to provide a helpful response. Be concise and accurate."""
        
        # Generate response
        response = self.llm.generate(prompt, system=SYSTEM_PROMPT)
        
        # Handle tool calls if present
        response = self._handle_tool_calls(response)
        
        self.history.append(Message(role="assistant", content=response))
        return response
    
    def chat_streaming(self, message: str) -> Generator[str, None, None]:
        """Stream a chat response."""
        self.history.append(Message(role="user", content=message))
        
        # Get context (simplified for streaming)
        ctx = self.retriever.retrieve(message, max_results=3)
        
        prompt = f"""## Context
{ctx.formatted}

## User Request
{message}

Provide a helpful response:"""
        
        full_response = ""
        for chunk in self.llm.generate_streaming(prompt, system=SYSTEM_PROMPT):
            full_response += chunk
            yield chunk
        
        self.history.append(Message(role="assistant", content=full_response))
    
    def _handle_tool_calls(self, response: str, max_iterations: int = 5) -> str:
        """Execute any tool calls in the response."""
        for _ in range(max_iterations):
            tool_call = self._extract_tool_call(response)
            if not tool_call:
                break
            
            tool_name = tool_call.get("tool")
            tool_args = tool_call.get("args", {})
            
            result = self._execute_tool(tool_name, tool_args)
            
            # Continue the conversation with tool result
            prompt = f"""Previous response:
{response}

Tool result ({tool_name}):
{result}

Continue your response based on the tool result:"""
            
            response = self.llm.generate(prompt, system=SYSTEM_PROMPT)
        
        return response
    
    def _extract_tool_call(self, response: str) -> Optional[Dict]:
        """Extract tool call JSON from response."""
        match = re.search(r'```json\s*(\{[^`]+\})\s*```', response, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(1))
                if "tool" in data:
                    return data
            except:
                pass
        return None
    
    def _execute_tool(self, tool_name: str, args: Dict) -> str:
        """Execute a tool and return result."""
        # Tool implementations
        if tool_name == "read_file":
            return self._tool_read_file(args.get("path", ""))
        elif tool_name == "search_codebase":
            return self._tool_search(args.get("query", ""))
        elif tool_name == "web_search":
            return self.web_search.search_formatted(args.get("query", ""))
        else:
            return f"Unknown tool: {tool_name}"
    
    def _tool_read_file(self, path: str) -> str:
        """Read a file."""
        try:
            full_path = self.workspace / path
            return full_path.read_text(encoding="utf-8", errors="ignore")[:5000]
        except Exception as e:
            return f"Error reading file: {e}"
    
    def _tool_search(self, query: str) -> str:
        """Search the codebase."""
        ctx = self.retriever.retrieve(query, max_results=5)
        return ctx.formatted
    
    def clear_history(self):
        """Clear conversation history."""
        self.history.clear()


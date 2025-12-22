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
    
    def initialize(self, force: bool = False):
        """Initialize the agent (index codebase, build call graph)."""
        if self._initialized and not force:
            return
        
        print("Initializing Forge...")
        print("  Indexing codebase...")
        self.retriever.index(force=force)
        
        self._initialized = True
        print("Ready!")
    
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


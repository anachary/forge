# Agents, Tools, MCP Servers: Complete Architecture Guide with Code Links

## The Big Picture: How Forge Works End-to-End

```
USER (VS Code)
    ↓
[VS Code Extension - TypeScript]
    ↓ (sends your question via stdio)
[MCP Server - Python]
    ↓ (receives message, initializes Agent)
[Agent - ForgeAgent]
    ├─ Receives: "Add user authentication"
    ├─ Asks: "What TOOLS do I need?"
    ├─ Calls: Tool 1, Tool 2, Tool 3 (in sequence)
    ├─ Gets: Results from tools
    ├─ Thinks: "Based on results, here's my plan"
    └─ Returns: Answer back to user
    ↓
[Tools - Actual Work Executors]
    ├─ SearchTool: Find relevant code
    ├─ AnalyzeTool: Understand architecture
    ├─ PlanTool: Create change strategy
    ├─ EditTool: Make code changes
    └─ TestTool: Generate tests
    ↓
[LLM - Claude/Ollama]
    ├─ Decides which tools to use
    ├─ Interprets tool results
    └─ Generates final response
    ↓
USER sees answer in VS Code
```

---

## Part 0: Getting Started - Auto-Indexing

**NEW**: Forge automatically indexes your codebase on first use!

### How It Works

When you create a ForgeAgent instance:

```python
from forge.agent import ForgeAgent

agent = ForgeAgent("/path/to/codebase")  # Auto-indexes if needed
response = agent.chat("What does this code do?")
```

**Execution Path**:
1. `forge/agent/forge_agent.py::class ForgeAgent::def __init__()` 
   - Creates agent instance
   - Calls `self._auto_initialize()`

2. `forge/agent/forge_agent.py::def _auto_initialize()`
   - Checks if `.forge/index_cache` exists
   - If NOT exists → calls `self.initialize()` (first time)
   - If EXISTS → calls `self._has_codebase_changed()`

3. `forge/agent/forge_agent.py::def _has_codebase_changed()`
   - Reads `.forge/index_metadata.json`
   - Compares file count and modification times
   - Returns True if changed, False if unchanged

4. Based on result:
   - **New codebase**: Auto-indexes (10-30 seconds)
   - **No changes**: Reuses cache (instant ⚡)
   - **Changed**: Re-indexes automatically

### Output Examples

**First time:**
```
📦 New codebase detected: forge
   Indexing for the first time...
Initializing Forge...
  Indexing codebase...
✅ Ready!
```

**Subsequent runs (no changes):**
```
✅ Using cached index for forge
```

**After adding files:**
```
🔄 Codebase changed, re-indexing forge...
   (Files: 45 → 47)
✅ Ready!
```

### Cache Location

```
your-codebase/
└── .forge/
    ├── index_cache              # Status marker
    ├── index_metadata.json      # File count, timestamps
    └── (index data)
```

### Key Files

- **Implementation**: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py#L68-L199)
  - Lines 68-85: `__init__()` with auto-init call
  - Lines 103-133: `_auto_initialize()` logic
  - Lines 135-165: `_has_codebase_changed()` detection
  - Lines 167-199: `_save_index_metadata()` persistence

- **Full Documentation**: [`AUTO_INDEXING.md`](AUTO_INDEXING.md)
- **Quick Reference**: [`AUTO_INDEXING_QUICK_REFERENCE.md`](AUTO_INDEXING_QUICK_REFERENCE.md)

---

## Part 1: What is an AGENT?

### Simple Definition
An **Agent** is like a smart assistant that:
1. **Receives** a question from you
2. **Thinks** about what tools it needs
3. **Uses** those tools to gather information
4. **Reasons** about the results
5. **Responds** with an answer

### In Your Forge

**Main Agent Class**: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)

**The Agent Initialization** 
- **Line**: [`forge/agent/forge_agent.py#L1-L50`](../forge/agent/forge_agent.py#L1-L50)
- Stores reference to LLM client
- Loads available tools
- Stores conversation history

**Receiving Question**
- **Line**: [`forge/agent/forge_agent.py::def answer(query: str)`](../forge/agent/forge_agent.py)
- Takes your question as input
- Prepares it with context

**Thinking Phase**
- **Line**: [`forge/agent/forge_agent.py::def _should_use_tool(tool_name)`](../forge/agent/forge_agent.py)
- Agent analyzes: "Do I need SearchTool? AnalyzeTool?"
- LLM's tool_choice parameter handles this

**Using Tools**
- **Line**: [`forge/agent/forge_agent.py::def _execute_tools(query)`](../forge/agent/forge_agent.py)
- Calls tools sequentially
- Each tool returns results

**Processing Tool Results**
- **Line**: [`forge/agent/forge_agent.py::def _process_tool_results(results)`](../forge/agent/forge_agent.py)
- Takes tool outputs
- Synthesizes into coherent answer

**Responding**
- **Line**: [`forge/agent/forge_agent.py::return final_response`](../forge/agent/forge_agent.py)
- Returns structured response to user

### How Agent Decides What To Do

The agent's internal dialogue:
```
Agent receives: "Add authentication to user routes"

Agent: "This is about CODE → I need SearchTool"
Agent: "I need to understand STRUCTURE → I need AnalyzeTool"
Agent: "This is a CHANGE request → I need PlanTool"
Agent: "I should probably show test coverage → I need TestTool"

Agent calls tools in sequence:
1. SearchTool.search("authentication user routes")
2. AnalyzeTool.analyze(files)
3. PlanTool.create_plan("Add auth", context)
4. Synthesize results into final answer
```

---

## Part 2: What are TOOLS?

### Simple Definition
**Tools** are like the Agent's hands. The Agent thinks, but Tools do the actual work.

Each tool is a **specialized capability** that does ONE thing well.

### Overview of All Tools

**Tools Directory**: [`forge/tools/`](../forge/tools/)

All tools inherit from **Base Tool**:
- **Line**: [`forge/tools/base_tool.py`](../forge/tools/base_tool.py)

---

### Tool 1: SearchTool (Find Code)

**File**: [`forge/tools/search_tool.py`](../forge/tools/search_tool.py)

**What it does**:
- Takes a query: "Find authentication code"
- Searches your semantic index (embeddings)
- Returns relevant files and functions

**Key Method - Execute**:
- **Line**: [`forge/tools/search_tool.py::class SearchTool::def execute()`](../forge/tools/search_tool.py)
- Converts query to embeddings
- Searches vector store
- Returns top matches

**Behind the scenes**:
```
SearchTool.search("authentication")
    ↓
Calls: forge/context/retriever.py::def retrieve(query)
    ├─ Location: forge/context/retriever.py
    ├─ Line: forge/context/retriever.py::def retrieve()
    └─ Converts query to embeddings
    
Calls: forge/context/vector_store.py::def search()
    ├─ Location: forge/context/vector_store.py
    ├─ Line: forge/context/vector_store.py::def search()
    └─ Searches embeddings database
    
Returns: [user.py, auth.py, test_auth.py]
```

**Related Components**:
- **Embedder**: [`forge/context/embedder.py`](../forge/context/embedder.py)
  - Line: [`forge/context/embedder.py::def embed()`](../forge/context/embedder.py)
  - Converts text to vectors

- **Vector Store**: [`forge/context/vector_store.py`](../forge/context/vector_store.py)
  - Line: [`forge/context/vector_store.py::def search()`](../forge/context/vector_store.py)
  - Stores and searches embeddings

---

### Tool 2: AnalyzeTool (Understand Architecture)

**File**: [`forge/tools/analyze_tool.py`](../forge/tools/analyze_tool.py)

**What it does**:
- Takes files from SearchTool
- Detects architecture pattern (MVC? Microservices?)
- Identifies layers (routes, services, models, middleware)
- Builds dependency graph
- Extracts design patterns

**Key Method - Execute**:
- **Line**: [`forge/tools/analyze_tool.py::class AnalyzeTool::def execute()`](../forge/tools/analyze_tool.py)
- Takes search results as input
- Calls sub-analyzers
- Returns architecture info

**Behind the scenes**:
```
AnalyzeTool.analyze(files)
    ↓
Calls: forge/analysis/architecture_analyzer.py::def analyze()
    ├─ Location: forge/analysis/architecture_analyzer.py
    ├─ Line: forge/analysis/architecture_analyzer.py::class ArchitectureAnalyzer::def analyze()
    ├─ Returns: Pattern detected (MVC)
    └─ Identifies layers
    
Calls: forge/analysis/architecture_analyzer.py::def _detect_pattern()
    ├─ Location: forge/analysis/architecture_analyzer.py
    ├─ Line: forge/analysis/architecture_analyzer.py::def _detect_pattern()
    └─ Detects: "This is MVC pattern"
    
Calls: forge/analysis/architecture_analyzer.py::def _identify_layers()
    ├─ Location: forge/analysis/architecture_analyzer.py
    ├─ Line: forge/analysis/architecture_analyzer.py::def _identify_layers()
    └─ Returns: {"routes": [...], "services": [...], "models": [...]}
    
Calls: forge/context/call_graph.py::def build()
    ├─ Location: forge/context/call_graph.py
    ├─ Line: forge/context/call_graph.py::class CallGraph::def build()
    └─ Returns: Function dependency graph
```

**Related Components**:
- **Architecture Analyzer**: [`forge/analysis/architecture_analyzer.py`](../forge/analysis/architecture_analyzer.py)
  - Line: [`forge/analysis/architecture_analyzer.py::def __init__()`](../forge/analysis/architecture_analyzer.py)
  - Analyzes codebase structure

- **Call Graph**: [`forge/context/call_graph.py`](../forge/context/call_graph.py)
  - Line: [`forge/context/call_graph.py::def get_callers()`](../forge/context/call_graph.py)
  - Line: [`forge/context/call_graph.py::def get_callees()`](../forge/context/call_graph.py)
  - Shows function relationships

---

### Tool 3: PlanTool (Create Strategy)

**File**: [`forge/tools/plan_tool.py`](../forge/tools/plan_tool.py)

**What it does**:
- Takes query + analysis results
- Creates step-by-step plan
- Decides which files to modify/create
- Routes by complexity
- Returns structured plan

**Key Method - Execute**:
- **Line**: [`forge/tools/plan_tool.py::class PlanTool::def execute()`](../forge/tools/plan_tool.py)
- Takes query + search results + architecture
- Calls ChangePlanner
- Returns Plan object

**Behind the scenes**:
```
PlanTool.create_plan(query, context, analysis)
    ↓
Calls: forge/analysis/change_planner.py::def create_plan()
    ├─ Location: forge/analysis/change_planner.py
    ├─ Line: forge/analysis/change_planner.py::class ChangePlanner::def create_plan()
    └─ Main planning logic
    
Calls: forge/analysis/change_planner.py::def _categorize_change()
    ├─ Location: forge/analysis/change_planner.py
    ├─ Line: forge/analysis/change_planner.py::def _categorize_change()
    └─ Determines: "This is a new feature"
    
Calls: forge/analysis/change_planner.py::def _identify_affected_layers()
    ├─ Location: forge/analysis/change_planner.py
    ├─ Line: forge/analysis/change_planner.py::def _identify_affected_layers()
    └─ Returns: ["routes", "middleware", "models"]
    
Calls: forge/analysis/complexity_router.py::def route()
    ├─ Location: forge/analysis/complexity_router.py
    ├─ Line: forge/analysis/complexity_router.py::class QueryComplexityRouter::def route()
    └─ Routes by complexity: COMPLEX → use FULL_CONTEXT strategy
```

**Related Components**:
- **Change Planner**: [`forge/analysis/change_planner.py`](../forge/analysis/change_planner.py)
  - Line: [`forge/analysis/change_planner.py::class ChangePlanner`](../forge/analysis/change_planner.py)
  - Creates change strategies

- **Complexity Router**: [`forge/analysis/complexity_router.py`](../forge/analysis/complexity_router.py)
  - Line: [`forge/analysis/complexity_router.py::class QueryComplexityRouter::def analyze_query()`](../forge/analysis/complexity_router.py)
  - Routes queries by complexity

---

### Tool 4: EditTool (Make Changes)

**File**: [`forge/tools/edit_tool.py`](../forge/tools/edit_tool.py)

**What it does**:
- Takes plan from PlanTool
- Makes **surgical edits** (NOT whole file rewrites!)
- Adds imports intelligently
- Adds new functions at right locations
- Modifies specific lines only

**Key Method - Execute**:
- **Line**: [`forge/tools/edit_tool.py::class EditTool::def execute()`](../forge/tools/edit_tool.py)
- Takes plan as input
- Calls IntelligentCodeEditor
- Returns applied changes

**Behind the scenes**:
```
EditTool.apply_changes(plan)
    ↓
Calls: forge/analysis/code_editor.py::class IntelligentCodeEditor
    ├─ Location: forge/analysis/code_editor.py
    ├─ Does NOT regenerate whole files!
    └─ Only adds what's needed

Calls: forge/analysis/code_editor.py::def apply_surgical_edit()
    ├─ Location: forge/analysis/code_editor.py
    ├─ Line: forge/analysis/code_editor.py::class IntelligentCodeEditor::def apply_surgical_edit()
    └─ Modifies only lines 42-45, leaves rest intact

Calls: forge/analysis/code_editor.py::def add_import()
    ├─ Location: forge/analysis/code_editor.py
    ├─ Line: forge/analysis/code_editor.py::def add_import()
    └─ Adds "from jwt import encode" at top

Calls: forge/analysis/code_editor.py::def add_function()
    ├─ Location: forge/analysis/code_editor.py
    ├─ Line: forge/analysis/code_editor.py::def add_function()
    └─ Adds new function after line 50

Calls: forge/analysis/code_editor.py::def add_decorator()
    ├─ Location: forge/analysis/code_editor.py
    ├─ Line: forge/analysis/code_editor.py::def add_decorator()
    └─ Adds @jwt_required above function
```

**Related Components**:
- **Code Editor**: [`forge/analysis/code_editor.py`](../forge/analysis/code_editor.py)
  - Line: [`forge/analysis/code_editor.py::class IntelligentCodeEditor`](../forge/analysis/code_editor.py)
  - Surgical code editing

---

### Tool 5: TestTool (Generate Tests)

**File**: [`forge/tools/test_tool.py`](../forge/tools/test_tool.py)

**What it does**:
- Takes modified files
- Learns test patterns from your codebase
- Generates tests matching YOUR style
- Complete code coverage

**Key Method - Execute**:
- **Line**: [`forge/tools/test_tool.py::class TestTool::def execute()`](../forge/tools/test_tool.py)
- Takes modified files as input
- Gets pattern learner results
- Generates tests

**Behind the scenes**:
```
TestTool.generate_tests(files)
    ↓
Calls: forge/analysis/pattern_learner.py::def get_pattern('test')
    ├─ Location: forge/analysis/pattern_learner.py
    ├─ Line: forge/analysis/pattern_learner.py::class PatternLearner::def get_pattern()
    └─ Returns learned test pattern from your codebase

Learned pattern example:
    def test_<feature>(self):
        mock_<dep> = Mock()
        result = function()
        assert result.status == 200
    ↓
Uses this pattern to generate new tests:
    def test_validate_token_success(self):
        mock_jwt = Mock()
        token = "valid"
        result = validate_token(token)
        assert result["success"] == True
```

**Related Components**:
- **Pattern Learner**: [`forge/analysis/pattern_learner.py`](../forge/analysis/pattern_learner.py)
  - Line: [`forge/analysis/pattern_learner.py::class PatternLearner::def learn_patterns()`](../forge/analysis/pattern_learner.py)
  - Learns code patterns from your codebase

---

### Tools Registry (How Tools Are Loaded)

**File**: [`forge/tools/__init__.py`](../forge/tools/__init__.py)

**How it works**:
- Line: [`forge/tools/__init__.py`](../forge/tools/__init__.py)
- Registers all available tools
- Agent loads tools from this registry
- When Agent initializes, it gets all tools:
  - Line: [`forge/agent/forge_agent.py::def __init__()`](../forge/agent/forge_agent.py)
  - Loads all tools from [`forge/tools/__init__.py`](../forge/tools/__init__.py)

---

## Part 3: What is MCP SERVER?

### Simple Definition
**MCP** = **Model Context Protocol**

It's a **translator** between:
- VS Code (wants to talk via JSON)
- ForgeAgent (understands Python)

### The Communication Flow

```
VS Code Extension (TypeScript)
    ↓ (sends JSON via stdio)
┌─────────────────────────────────┐
│  MCP Server                     │
│  ┌─────────────────────────────┐│
│  │ Receives JSON message       ││
│  │ "call_tool": "search_code"  ││
│  └──────────────┬──────────────┘│
│                 ↓               │
│  ┌─────────────────────────────┐│
│  │ Routes to Agent             ││
│  │ Calls ForgeAgent.execute()  ││
│  └──────────────┬──────────────┘│
│                 ↓               │
│  ┌─────────────────────────────┐│
│  │ Agent processes + returns   ││
│  │ result dict                 ││
│  └──────────────┬──────────────┘│
│                 ↓               │
│  ┌─────────────────────────────┐│
│  │ Converts result to JSON     ││
│  │ Sends back via stdio        ││
│  └─────────────────────────────┘│
└─────────────────────────────────┘
    ↓ (sends JSON via stdio)
VS Code Extension receives response
```

### MCP Server Files

**Main MCP Server**: [`forge/mcp/server.py`](../forge/mcp/server.py)

**Key Components**:

#### 1. Server Initialization
- **File**: [`forge/mcp/server.py`](../forge/mcp/server.py)
- **Line**: [`forge/mcp/server.py::class MCPServer::def __init__()`](../forge/mcp/server.py)
- Sets up stdio communication
- Initializes ForgeAgent
- Registers message handlers

#### 2. Message Reception
- **File**: [`forge/mcp/server.py`](../forge/mcp/server.py)
- **Line**: [`forge/mcp/server.py::async def handle_message(message)`](../forge/mcp/server.py)
- Receives JSON from VS Code
- Parses the request

#### 3. Message Routing
- **File**: [`forge/mcp/server.py`](../forge/mcp/server.py)
- **Line**: [`forge/mcp/server.py::def _route_request(request)`](../forge/mcp/server.py)
- Checks: Is this a "search"? "analyze"? "generate"?
- Routes to appropriate handler

#### 4. Agent Execution
- **File**: [`forge/mcp/server.py`](../forge/mcp/server.py)
- **Line**: [`forge/mcp/server.py::async def _execute_agent(query, context)`](../forge/mcp/server.py)
- Calls ForgeAgent
- Waits for result
- Calls: [`forge/agent/forge_agent.py::def answer(query)`](../forge/agent/forge_agent.py)

#### 5. Response Formatting
- **File**: [`forge/mcp/server.py`](../forge/mcp/server.py)
- **Line**: [`forge/mcp/server.py::def _format_response(result)`](../forge/mcp/server.py)
- Converts Python dict to JSON
- Adds metadata (status, timing, errors)

#### 6. Message Sending
- **File**: [`forge/mcp/server.py`](../forge/mcp/server.py)
- **Line**: [`forge/mcp/server.py::async def send_response(response)`](../forge/mcp/server.py)
- Sends JSON back via stdio

---

## Part 4: How Everything Works Together

### Complete Flow: "Add user authentication with JWT"

```
STEP 1: User types in VS Code
├─ File: forge-vscode/src/extension.ts
├─ Line: forge-vscode/src/extension.ts::activate()
│   - Listens for user commands
├─ Line: forge-vscode/src/extension.ts::onQuery()
│   - Captures query text
│   - Packages as JSON message
│   - Sends to MCP Server via stdio

STEP 2: MCP Server receives message
├─ File: forge/mcp/server.py
├─ Line: forge/mcp/server.py::handle_message()
│   - Receives JSON via stdin
│   - Parses: {"method": "answer", "params": {"query": "..."}}
├─ Line: forge/mcp/server.py::_route_request()
│   - Recognizes this is an "answer" request
│   - Routes to Agent execution handler

STEP 3: Agent is initialized
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::class ForgeAgent::def __init__()
│   - Loads all available tools
│   - Connects to LLM (Ollama or Claude)
│   - Sets up context manager
├─ Line: forge/agent/forge_agent.py::def answer(query)
│   - Receives: "Add user authentication with JWT"
│   - Prepares prompt with instruction

STEP 4: Agent queries LLM about which tools to use
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _call_llm_with_tools()
│   - Sends query + tool descriptions to LLM
│   - LLM decides: "I need SearchTool first!"
├─ File: forge/llm/providers.py
├─ Line: forge/llm/providers.py::class OllamaProvider::def complete()
│   - Sends to Ollama server (or OpenAI)
│   - Gets back: Tool choice + parameters
├─ Line: forge/agent/forge_agent.py::def _parse_tool_call()
│   - Parses LLM response
│   - Extracts: tool_name="search", params={"query": "..."}

STEP 5: Agent executes SearchTool
├─ File: forge/tools/search_tool.py
├─ Line: forge/tools/search_tool.py::class SearchTool::def execute()
│   - Calls: search("authentication jwt user")
├─ File: forge/context/retriever.py
├─ Line: forge/context/retriever.py::def retrieve(query)
│   - Converts query to embeddings
│   - Searches vector store
│   - Returns top 5 matching files:
│   │  1. forge/auth/jwt_service.py
│   │  2. forge/middleware/auth.py
│   │  3. tests/test_auth.py
│   │  4. models/user.py
│   │  5. services/user_service.py
├─ Line: forge/tools/search_tool.py::def format_results()
│   - Formats results as structured data
│   - Returns to Agent

STEP 6: Agent asks: "What's the architecture?"
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _call_llm_with_tools()
│   - LLM decides: "Now I need AnalyzeTool"
├─ File: forge/tools/analyze_tool.py
├─ Line: forge/tools/analyze_tool.py::class AnalyzeTool::def execute()
│   - Takes search results
├─ File: forge/analysis/architecture_analyzer.py
├─ Line: forge/analysis/architecture_analyzer.py::class ArchitectureAnalyzer::def analyze()
│   - Detects: "This is MVC pattern"
│   - Identifies layers:
│   │  - Routes layer: forge/routes/
│   │  - Services layer: forge/services/
│   │  - Models layer: forge/models/
│   │  - Middleware layer: forge/middleware/
├─ File: forge/context/call_graph.py
├─ Line: forge/context/call_graph.py::class CallGraph::def build()
│   - Builds dependency graph
│   - Shows: Which functions call which
├─ Line: forge/tools/analyze_tool.py::def format_results()
│   - Returns architecture info to Agent

STEP 7: Agent plans the changes
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _call_llm_with_tools()
│   - LLM decides: "Now I need PlanTool"
├─ File: forge/tools/plan_tool.py
├─ Line: forge/tools/plan_tool.py::class PlanTool::def execute()
│   - Takes query + search results + architecture
├─ File: forge/analysis/change_planner.py
├─ Line: forge/analysis/change_planner.py::class ChangePlanner::def create_plan()
│   - Analyzes: "This is a new feature"
│   - Identifies affected layers: routes, middleware, models, tests
│   - Creates plan with priorities
├─ File: forge/analysis/complexity_router.py
├─ Line: forge/analysis/complexity_router.py::class QueryComplexityRouter::def route()
│   - Complexity level: COMPLEX
│   - Strategy: FULL_CONTEXT
├─ Line: forge/tools/plan_tool.py::def format_results()
│   - Returns plan to Agent

STEP 8: Agent learns your code patterns
├─ File: forge/analysis/pattern_learner.py
├─ Line: forge/analysis/pattern_learner.py::class PatternLearner::def learn_patterns()
│   - Already ran during initialization
│   - Has extracted patterns:
│   │  - Test pattern
│   │  - Validation pattern
│   │  - Error handling pattern
│   │  - Response format
├─ Line: forge/analysis/pattern_learner.py::def get_pattern()
│   - Provides patterns for code generation

STEP 9: Agent generates code changes
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _call_llm_with_tools()
│   - LLM decides: "Generate the code"
│   - Uses patterns to ensure consistency
├─ File: forge/llm/providers.py
├─ Line: forge/llm/providers.py::class OllamaProvider::def complete()
│   - LLM generates code using learned patterns
├─ Line: forge/agent/forge_agent.py::def _parse_generated_code()
│   - Parses LLM output
│   - Extracts code changes

STEP 10: Agent applies changes using EditTool
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _call_llm_with_tools()
│   - LLM decides: "Apply with EditTool"
├─ File: forge/tools/edit_tool.py
├─ Line: forge/tools/edit_tool.py::class EditTool::def execute()
│   - Takes list of changes
├─ File: forge/analysis/code_editor.py
├─ Line: forge/analysis/code_editor.py::class IntelligentCodeEditor::def apply_surgical_edit()
│   - Doesn't regenerate whole file!
│   - Surgical edits only
├─ Line: forge/analysis/code_editor.py::def add_import()
│   - Adds import statement at top
├─ Line: forge/analysis/code_editor.py::def add_function()
│   - Adds new function
├─ Line: forge/analysis/code_editor.py::def add_decorator()
│   - Adds decorator to existing function
├─ Line: forge/tools/edit_tool.py::def format_results()
│   - Returns: "Changes applied"

STEP 11: Agent generates tests
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _call_llm_with_tools()
│   - LLM decides: "Generate tests"
├─ File: forge/tools/test_tool.py
├─ Line: forge/tools/test_tool.py::class TestTool::def execute()
│   - Takes modified files
├─ File: forge/analysis/pattern_learner.py
├─ Line: forge/analysis/pattern_learner.py::def get_pattern('test')
│   - Gets learned test pattern
├─ File: forge/llm/providers.py
├─ Line: forge/llm/providers.py::class OllamaProvider::def complete()
│   - LLM generates tests with patterns
├─ Line: forge/tools/test_tool.py::def format_results()
│   - Returns: Generated tests

STEP 12: Agent synthesizes final response
├─ File: forge/agent/forge_agent.py
├─ Line: forge/agent/forge_agent.py::def _synthesize_final_response()
│   - Combines all tool results
├─ File: forge/llm/providers.py
├─ Line: forge/llm/providers.py::class OllamaProvider::def complete()
│   - LLM generates explanation
├─ Line: forge/agent/forge_agent.py::return final_response
│   - Returns structured response

STEP 13: MCP Server formats response as JSON
├─ File: forge/mcp/server.py
├─ Line: forge/mcp/server.py::def _format_response()
│   - Converts Python dict to JSON
│   - Adds metadata
├─ Line: forge/mcp/server.py::async def send_response()
│   - Sends JSON via stdout

STEP 14: VS Code Extension receives response
├─ File: forge-vscode/src/extension.ts
├─ Line: forge-vscode/src/extension.ts::onMCPResponse()
│   - Receives JSON via stdout
├─ Line: forge-vscode/src/extension.ts::displayAnswer()
│   - Shows in chat panel
│   - User sees beautiful UI
```

---

## Part 5: Key Relationships

### Agent → Tools Relationship

**How they interact**:

1. Agent decides it needs a tool
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _call_llm_with_tools()`](../forge/agent/forge_agent.py)

2. Agent calls the tool
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _execute_tools()`](../forge/agent/forge_agent.py)

3. Tool executes and returns data
   - File: [`forge/tools/base_tool.py`](../forge/tools/base_tool.py)
   - Line: [`forge/tools/base_tool.py::def execute()`](../forge/tools/base_tool.py)

4. Agent processes results
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _process_tool_results()`](../forge/agent/forge_agent.py)

---

### LLM → Agent Relationship

**How they interact**:

1. Agent asks LLM which tool to use
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _call_llm_with_tools()`](../forge/agent/forge_agent.py)

2. LLM decides and returns tool name
   - File: [`forge/llm/providers.py`](../forge/llm/providers.py)
   - Line: [`forge/llm/providers.py::class OllamaProvider::def complete()`](../forge/llm/providers.py)

3. Agent executes that tool
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _execute_tools()`](../forge/agent/forge_agent.py)

4. Agent provides results to LLM
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _call_llm_with_tools()`](../forge/agent/forge_agent.py)

5. Repeat until answer is ready
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def _synthesize_final_response()`](../forge/agent/forge_agent.py)

---

### MCP Server → Agent Relationship

**How they interact**:

1. MCP Server receives JSON request
   - File: [`forge/mcp/server.py`](../forge/mcp/server.py)
   - Line: [`forge/mcp/server.py::async def handle_message()`](../forge/mcp/server.py)

2. MCP Server routes to Agent
   - File: [`forge/mcp/server.py`](../forge/mcp/server.py)
   - Line: [`forge/mcp/server.py::async def _execute_agent()`](../forge/mcp/server.py)

3. Agent does work
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::def answer()`](../forge/agent/forge_agent.py)

4. Agent returns Python dict
   - File: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Line: [`forge/agent/forge_agent.py::return final_response`](../forge/agent/forge_agent.py)

5. MCP Server converts to JSON
   - File: [`forge/mcp/server.py`](../forge/mcp/server.py)
   - Line: [`forge/mcp/server.py::def _format_response()`](../forge/mcp/server.py)

6. MCP Server sends JSON response
   - File: [`forge/mcp/server.py`](../forge/mcp/server.py)
   - Line: [`forge/mcp/server.py::async def send_response()`](../forge/mcp/server.py)

---

## Part 6: Key Files Summary

| Component | File | Purpose | Key Methods |
|-----------|------|---------|-------------|
| **Agent** | [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py) | Orchestrates everything | `answer()`, `_call_llm_with_tools()`, `_execute_tools()` |
| **MCP Server** | [`forge/mcp/server.py`](../forge/mcp/server.py) | JSON↔Python translator | `handle_message()`, `_route_request()`, `send_response()` |
| **SearchTool** | [`forge/tools/search_tool.py`](../forge/tools/search_tool.py) | Find code in index | `execute()`, `search()` |
| **AnalyzeTool** | [`forge/tools/analyze_tool.py`](../forge/tools/analyze_tool.py) | Understand architecture | `execute()`, `analyze()` |
| **PlanTool** | [`forge/tools/plan_tool.py`](../forge/tools/plan_tool.py) | Create strategy | `execute()`, `create_plan()` |
| **EditTool** | [`forge/tools/edit_tool.py`](../forge/tools/edit_tool.py) | Make code changes | `execute()`, `apply_changes()` |
| **TestTool** | [`forge/tools/test_tool.py`](../forge/tools/test_tool.py) | Generate tests | `execute()`, `generate_tests()` |
| **Retriever** | [`forge/context/retriever.py`](../forge/context/retriever.py) | Semantic search | `retrieve()` |
| **Call Graph** | [`forge/context/call_graph.py`](../forge/context/call_graph.py) | Build dependencies | `build()`, `get_callers()`, `get_callees()` |
| **Architecture Analyzer** | [`forge/analysis/architecture_analyzer.py`](../forge/analysis/architecture_analyzer.py) | Detect patterns | `analyze()`, `_detect_pattern()` |
| **Pattern Learner** | [`forge/analysis/pattern_learner.py`](../forge/analysis/pattern_learner.py) | Learn code style | `learn_patterns()`, `get_pattern()` |
| **Change Planner** | [`forge/analysis/change_planner.py`](../forge/analysis/change_planner.py) | Create plans | `create_plan()` |
| **Code Editor** | [`forge/analysis/code_editor.py`](../forge/analysis/code_editor.py) | Surgical edits | `apply_surgical_edit()`, `add_function()` |
| **LLM Provider** | [`forge/llm/providers.py`](../forge/llm/providers.py) | Talk to LLM | `complete()`, `stream()` |
| **VS Code Extension** | `forge-vscode/src/extension.ts` | User interface | `activate()`, `onQuery()`, `displayAnswer()` |
| **Config** | [`forge/config.py`](../forge/config.py) | Configuration | Settings and feature flags |
| **Context Manager** | [`forge/context/context_manager.py`](../forge/context/context_manager.py) | Manage context | `get_context()`, `add_to_context()` |

---

## Part 7: Data Flow Architecture

### Complete Data Flow Diagram

```
INPUT LAYER
└─ VS Code user types query
   File: forge-vscode/src/extension.ts

COMMUNICATION LAYER
├─ JSON Message via stdio
├─ File: forge/mcp/server.py
└─ Line: forge/mcp/server.py::async def handle_message()

REQUEST ROUTING LAYER
├─ Parse and route request
├─ File: forge/mcp/server.py
└─ Line: forge/mcp/server.py::def _route_request()

AGENT INITIALIZATION LAYER
├─ Initialize ForgeAgent
├─ File: forge/agent/forge_agent.py
└─ Line: forge/agent/forge_agent.py::class ForgeAgent::def __init__()

CONTEXT BUILDING LAYER
├─ Retrieve context
├─ File: forge/context/context_manager.py
└─ Line: forge/context/context_manager.py::def get_context()

LLM DECISION LAYER
├─ Ask LLM which tool to use
├─ File: forge/llm/providers.py
└─ Line: forge/llm/providers.py::class OllamaProvider::def complete()

TOOL EXECUTION LAYER
├─ SearchTool: forge/tools/search_tool.py
├─ AnalyzeTool: forge/tools/analyze_tool.py
├─ PlanTool: forge/tools/plan_tool.py
├─ EditTool: forge/tools/edit_tool.py
└─ TestTool: forge/tools/test_tool.py

ANALYSIS LAYER
├─ Architecture: forge/analysis/architecture_analyzer.py
├─ Patterns: forge/analysis/pattern_learner.py
├─ Planning: forge/analysis/change_planner.py
├─ Editing: forge/analysis/code_editor.py
└─ Routing: forge/analysis/complexity_router.py

CONTEXT LAYER
├─ Retrieval: forge/context/retriever.py
├─ Embeddings: forge/context/embedder.py
├─ Call Graph: forge/context/call_graph.py
└─ Vector Store: forge/context/vector_store.py

RESPONSE SYNTHESIS LAYER
├─ Combine tool results
├─ File: forge/agent/forge_agent.py
└─ Line: forge/agent/forge_agent.py::def _synthesize_final_response()

RESPONSE FORMATTING LAYER
├─ Convert to JSON
├─ File: forge/mcp/server.py
└─ Line: forge/mcp/server.py::def _format_response()

OUTPUT LAYER
├─ Send JSON via stdio
├─ File: forge/mcp/server.py
└─ Line: forge/mcp/server.py::async def send_response()

USER DISPLAY LAYER
└─ VS Code shows answer
   File: forge-vscode/src/extension.ts
```

---

## Part 8: Configuration & Initialization

### Configuration File

**File**: [`forge/config.py`](../forge/config.py)

**What it contains**:
- Feature flags for each component
- LLM provider settings
- Context window sizes
- Token budgets
- Complexity routing settings

**Key configuration lines**:
- Line: [`forge/config.py::ENABLE_SEMANTIC_INDEXING`](../forge/config.py)
- Line: [`forge/config.py::ENABLE_COMPLEXITY_ROUTING`](../forge/config.py)
- Line: [`forge/config.py::ENABLE_CONTEXT_WINDOW_OPTIMIZATION`](../forge/config.py)
- Line: [`forge/config.py::LLM_PROVIDER`](../forge/config.py)

### Initialization Order

```
1. Load Configuration
   File: forge/config.py
   Line: forge/config.py

2. Initialize LLM Provider
   File: forge/llm/providers.py
   Line: forge/llm/providers.py::class OllamaProvider::def __init__()

3. Initialize Context Manager
   File: forge/context/context_manager.py
   Line: forge/context/context_manager.py::class ContextManager::def __init__()

4. Initialize Tools Registry
   File: forge/tools/__init__.py
   Line: forge/tools/__init__.py

5. Initialize Agent
   File: forge/agent/forge_agent.py
   Line: forge/agent/forge_agent.py::class ForgeAgent::def __init__()

6. Start MCP Server
   File: forge/mcp/server.py
   Line: forge/mcp/server.py::async def start()
```

---

## Key Takeaways

1. **Agent** = Decision maker, orchestrator
   - [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)

2. **Tools** = Executors, do the work
   - [`forge/tools/`](../forge/tools/)

3. **MCP Server** = Translator, JSON ↔ Python
   - [`forge/mcp/server.py`](../forge/mcp/server.py)

4. **LLM** = Brain, decides which tools to use
   - [`forge/llm/providers.py`](../forge/llm/providers.py)

5. **Context Layer** = Knowledge base
   - [`forge/context/`](../forge/context/)

6. **Analysis Layer** = Understanding and planning
   - [`forge/analysis/`](../forge/analysis/)

Everything is **modular**, **testable**, and **transparent**.

---

## Next Steps to Understand Code

1. Start with **Agent**:
   - Read: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
   - Understand: Main orchestration logic

2. Then read **Each Tool**:
   - SearchTool: [`forge/tools/search_tool.py`](../forge/tools/search_tool.py)
   - AnalyzeTool: [`forge/tools/analyze_tool.py`](../forge/tools/analyze_tool.py)
   - PlanTool: [`forge/tools/plan_tool.py`](../forge/tools/plan_tool.py)
   - EditTool: [`forge/tools/edit_tool.py`](../forge/tools/edit_tool.py)
   - TestTool: [`forge/tools/test_tool.py`](../forge/tools/test_tool.py)

3. Then understand **MCP Server**:
   - Read: [`forge/mcp/server.py`](../forge/mcp/server.py)
   - Understand: Communication protocol

4. Then explore **Analysis Layer**:
   - Architecture: [`forge/analysis/architecture_analyzer.py`](../forge/analysis/architecture_analyzer.py)
   - Patterns: [`forge/analysis/pattern_learner.py`](../forge/analysis/pattern_learner.py)
   - Planning: [`forge/analysis/change_planner.py`](../forge/analysis/change_planner.py)

5. Finally explore **Context Layer**:
   - Retriever: [`forge/context/retriever.py`](../forge/context/retriever.py)
   - Call Graph: [`forge/context/call_graph.py`](../forge/context/call_graph.py)
   - Embedder: [`forge/context/embedder.py`](../forge/context/embedder.py)

---

**This document provides the complete architecture with direct links to every component!** 🚀

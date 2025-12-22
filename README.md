 Forge

**Local AI Coding Agent**

*Deep context. Full autonomy. Zero cloud.*

Forge is a fully local, privacy-first AI coding agent that understands your entire codebase through semantic search, call graph analysis, and git history.

## Features

- **100% Local** - Runs entirely on your machine using Ollama
- **Deep Context** - Semantic code search with embeddings
- **Call Graph Analysis** - Understands code relationships
- **Git History** - Leverages version control context
- **Web Search** - DuckDuckGo integration (no API key)
- **MCP Support** - Works with Claude Desktop and VS Code
- **Agentic** - Tool use with ReAct pattern

## Quick Start

### Prerequisites

1. **Ollama** - Install from [ollama.ai](https://ollama.ai)
2. **Python 3.10+**

### Installation

```bash
# Clone the repository
git clone https://github.com/forge-ai/forge.git
cd forge

# Install dependencies
pip install -e .

# Pull required models
ollama pull qwen2.5-coder:7b
ollama pull nomic-embed-text
```

### Usage

```bash
# Interactive chat
forge chat

# Index your codebase
forge index

# Search semantically
forge search "authentication logic"

# Run as MCP server
forge mcp
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FORGE AGENT                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   User       │───▶│   Intent     │───▶│   Context    │      │
│  │   Query      │    │   Classifier │    │   Strategy   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                 │               │
│                    ┌────────────────────────────┼───────────┐   │
│                    │                            ▼           │   │
│                    │  ┌─────────────────────────────────┐   │   │
│                    │  │       CONTEXT ENGINE            │   │   │
│                    │  ├─────────────────────────────────┤   │   │
│                    │  │                                 │   │   │
│  ┌──────────────┐  │  │  ┌─────────┐    ┌──────────┐   │   │   │
│  │  Semantic    │◀─┼──┼──│ Embedder│───▶│ LanceDB  │   │   │   │
│  │  Chunker     │  │  │  │ (Ollama)│    │ (Vector) │   │   │   │
│  └──────────────┘  │  │  └─────────┘    └──────────┘   │   │   │
│        │           │  │                                 │   │   │
│        ▼           │  │  ┌─────────┐    ┌──────────┐   │   │   │
│  ┌──────────────┐  │  │  │  Call   │    │   Git    │   │   │   │
│  │ Tree-sitter  │  │  │  │  Graph  │    │ Context  │   │   │   │
│  │    AST       │  │  │  └─────────┘    └──────────┘   │   │   │
│  └──────────────┘  │  │                                 │   │   │
│                    │  └─────────────────────────────────┘   │   │
│                    │                                        │   │
│                    │  ┌─────────────────────────────────┐   │   │
│                    │  │         TOOLS                   │   │   │
│                    │  ├─────────────────────────────────┤   │   │
│                    │  │  File Ops │ Terminal │ Web      │   │   │
│                    │  └─────────────────────────────────┘   │   │
│                    └────────────────────────────────────────┘   │
│                                          │                      │
│                                          ▼                      │
│                    ┌─────────────────────────────────────────┐  │
│                    │              LLM (Ollama)               │  │
│                    │         qwen2.5-coder / llama3          │  │
│                    └─────────────────────────────────────────┘  │
│                                          │                      │
│                                          ▼                      │
│                    ┌─────────────────────────────────────────┐  │
│                    │            Response + Actions           │  │
│                    └─────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Retrieval-Augmented Generation (RAG)

Instead of relying solely on the LLM's training data, Forge retrieves relevant code from your codebase and includes it in the prompt.

**How it works:**
1. Code is chunked at semantic boundaries (functions, classes)
2. Each chunk is embedded into a vector using `nomic-embed-text`
3. Vectors are stored in LanceDB (local vector database)
4. User queries are embedded and matched against stored vectors
5. Top matches are included in the LLM prompt

**Reference:**
> Lewis, P., et al. (2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*. NeurIPS.
> [arXiv:2005.11401](https://arxiv.org/abs/2005.11401)

### 2. Semantic Code Chunking

Code is split at meaningful boundaries using AST parsing, not arbitrary character counts.

**Why it matters:**
- Functions stay together
- Classes stay together
- Context is coherent

**Implementation:**
- Uses Tree-sitter for fast, accurate parsing
- Supports Python, JavaScript, TypeScript, Go, Rust, Java

**Reference:**
> Husain, H., et al. (2019). *CodeSearchNet Challenge: Evaluating the State of Semantic Code Search*.
> [arXiv:1909.09436](https://arxiv.org/abs/1909.09436)

### 3. Vector Embeddings

Text is converted to dense vectors where semantic similarity = vector proximity.

**Model:** `nomic-embed-text` via Ollama
- 768 dimensions
- Trained on code and text
- Runs locally

**Reference:**
> Reimers, N., & Gurevych, I. (2019). *Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks*.
> [arXiv:1908.10084](https://arxiv.org/abs/1908.10084)

### 4. Call Graph Analysis

Static analysis to understand code relationships.

**Enables:**
- "Find all callers of function X"
- "What functions does X call?"
- "What's the impact of changing X?"

**Reference:**
> Horwitz, S., Reps, T., & Binkley, D. (1990). *Interprocedural Slicing Using Dependence Graphs*. ACM TOPLAS.

### 5. Git History Context

Leverages version control for additional signals.

**Provides:**
- Recent changes (what's being worked on)
- File experts (who knows this code)
- Related files (often changed together)

**Reference:**
> Zimmermann, T., et al. (2005). *Mining Version Histories to Guide Software Changes*. IEEE TSE.

### 6. ReAct Pattern (Agentic Behavior)

The agent can reason and act in a loop.

**Pattern:**
1. **Reason** - Think about what to do
2. **Act** - Use a tool
3. **Observe** - See the result
4. **Repeat** - Until task is complete

**Reference:**
> Yao, S., et al. (2022). *ReAct: Synergizing Reasoning and Acting in Language Models*. ICLR.
> [arXiv:2210.03629](https://arxiv.org/abs/2210.03629)

### 7. Intent Classification

Classifies user queries to optimize context retrieval.

| Intent | Codebase | Web | Git |
|--------|----------|-----|-----|
| Explain code | Yes | No | Yes |
| Fix bug | Yes | No | Yes |
| Write code | Yes | No | No |
| Compare tools | Yes | Yes | No |
| External info | No | Yes | No |

### 8. Token Budgeting

Manages context window limits for different models.

| Model Size | Context Budget |
|------------|----------------|
| 7B | ~3,000 tokens |
| 14B+ | ~5,000 tokens |
| Claude/GPT-4 | ~10,000 tokens |

## Project Structure

```
forge/
├── forge/
│   ├── __init__.py
│   ├── config.py           # Configuration
│   ├── cli.py              # Command line interface
│   │
│   ├── context/            # Context Engine
│   │   ├── embedder.py     # Ollama embeddings
│   │   ├── chunker.py      # Semantic code chunking
│   │   ├── vector_store.py # LanceDB storage
│   │   ├── call_graph.py   # Static analysis
│   │   ├── git_context.py  # Git history
│   │   └── retriever.py    # Unified retrieval
│   │
│   ├── agent/              # Agent Core
│   │   ├── llm.py          # LLM interface
│   │   ├── prompt_enhancer.py  # Intent classification
│   │   └── forge_agent.py  # Main agent
│   │
│   ├── tools/              # Agent Tools
│   │   ├── file_tools.py   # File operations
│   │   ├── terminal.py     # Command execution
│   │   └── web_search.py   # DuckDuckGo search
│   │
│   └── mcp/                # MCP Server
│       └── server.py       # Tool server
│
├── requirements.txt
├── pyproject.toml
└── README.md
```

## Configuration

Configuration is managed via environment variables or `~/.forge/config.json`:

```python
# Default configuration
ForgeConfig(
    ollama_url="http://localhost:11434",
    model="qwen2.5-coder:7b",
    embedding_model="nomic-embed-text",
    max_context_tokens=4000,
    temperature=0.7,
    enable_web_search=True,
    enable_call_graph=True,
    enable_git_context=True,
)
```

### Environment Variables

```bash
FORGE_OLLAMA_URL=http://localhost:11434
FORGE_MODEL=qwen2.5-coder:7b
FORGE_EMBEDDING_MODEL=nomic-embed-text
```

## MCP Integration

Forge can run as an MCP (Model Context Protocol) server for use with Claude Desktop or VS Code.

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "forge": {
      "command": "forge",
      "args": ["mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

### VS Code

The MCP server exposes these tools:
- `read_file` - Read file contents
- `write_file` - Write to files
- `search_codebase` - Semantic search
- `run_command` - Execute commands
- `web_search` - Web search

## Data Flow

```
User Query: "How does the auth middleware work?"
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Intent Classification            │
│    → CODE_EXPLAIN (confidence: 0.9) │
│    → Strategy: codebase + git       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 2. Context Retrieval                │
│    a. Embed query → vector          │
│    b. Search LanceDB → top 5 chunks │
│    c. Get call graph for symbols    │
│    d. Get recent git commits        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 3. Prompt Assembly                  │
│    Context + Query + System Prompt  │
│    (within token budget)            │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 4. LLM Generation                   │
│    Ollama → qwen2.5-coder:7b        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 5. Tool Execution (if needed)       │
│    ReAct loop until complete        │
└─────────────────────────────────────┘
    │
    ▼
Response to User
```

## Comparison with Other Tools

| Feature | Forge | Cursor | Copilot | Cline |
|---------|-------|--------|---------|-------|
| Local LLM | Yes | No | No | Yes |
| Privacy | 100% | Cloud | Cloud | Local |
| Semantic Search | Yes | Yes | Limited | No |
| Call Graph | Yes | No | No | No |
| Git Context | Yes | Limited | No | No |
| Web Search | Yes | No | No | No |
| MCP Support | Yes | No | No | Yes |
| Free | Yes | Paid | Paid | Yes |

## License

MIT License - See LICENSE file for details.

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.

## Acknowledgments

Built on the shoulders of giants:
- [Ollama](https://ollama.ai) - Local LLM runtime
- [LanceDB](https://lancedb.com) - Embedded vector database
- [Tree-sitter](https://tree-sitter.github.io) - Code parsing
- [DuckDuckGo](https://duckduckgo.com) - Privacy-respecting search


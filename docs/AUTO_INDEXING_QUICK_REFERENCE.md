# Auto-Indexing Quick Reference

## At a Glance

| Aspect | Details |
|--------|---------|
| **Trigger** | Automatic on `ForgeAgent()` creation |
| **First Run** | Indexes codebase (10-30s) |
| **Cached** | Reuses index if no changes (<100ms) |
| **Changes** | Auto re-indexes when files added/modified |
| **Cache** | Stored in `.forge/` directory |
| **Manual** | Call `agent.initialize(force=True)` |

## Quick Start

### Auto-Indexing (No Manual Steps)

```python
from forge.agent import ForgeAgent

# Auto-indexes on creation
agent = ForgeAgent("/path/to/codebase")

# Ready to use immediately
response = agent.chat("What does this do?")
```

### Force Re-Index

```python
# Useful after large code changes
agent.initialize(force=True)
```

## Common Scenarios

### Scenario 1: First Time Opening Codebase

```
user$ agent = ForgeAgent("/path/to/forge")
📦 New codebase detected: forge
   Indexing for the first time...
Initializing Forge...
  Indexing codebase...
✅ Ready!
```

**Time: 15 seconds** ⏱️

### Scenario 2: Same Codebase, No Changes

```
user$ agent = ForgeAgent("/path/to/forge")
✅ Using cached index for forge
```

**Time: <100ms** ⚡

### Scenario 3: Files Added, Auto-Re-Index

```
user$ agent = ForgeAgent("/path/to/forge")
🔄 Codebase changed, re-indexing forge...
   (Files: 45 → 47)
Initializing Forge...
  Indexing codebase...
✅ Ready!
```

**Time: 15 seconds** ⏱️

## Commands

### CLI

```bash
# Force re-index
forge index --force

# Check cache status
ls -la .forge/

# View metadata
cat .forge/index_metadata.json
```

### Python

```python
# Auto-indexes
agent = ForgeAgent(workspace)

# Manual full re-index
agent.initialize(force=True)

# Check status
print(agent._initialized)  # True/False
```

## Cache Files

### `.forge/index_cache`
- Empty marker file
- Indicates codebase is indexed

### `.forge/index_metadata.json`
- File count
- Last modified timestamp
- Index creation time
- Embedding provider (triggers re-index on change)

### `.forge/` (other files)
- Vector embeddings
- Code chunks
- Index data

## File Comparison

### File Count Change Detected

```json
// Old metadata
{"file_count": 45}

// New file added
// New count: 46

// Result: Re-index triggered ✅
```

### Timestamp Change Detected

```json
// Old metadata
{"last_modified": 1703830000}

// File modified
// New timestamp: 1703830500

// Result: Re-index triggered ✅
```

## Storage

### Location
```
your-project/
└── .forge/                    ← Auto-created
    ├── index_cache            ← Status marker
    └── index_metadata.json    ← Change detection data
```

### Size
- Small codebase: ~50MB
- Medium codebase: ~200MB
- Large codebase: ~500MB+

### Git
```
# .gitignore
.forge/
```

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| First index | 10-30s | Full scan + embeddings |
| Cache hit | <100ms | Reuse existing index |
| Change detection | 50ms | File stat comparison |
| Force re-index | 10-30s | Full re-scan |

## Troubleshooting

### Cache Corrupted?
```bash
rm -rf .forge/
# Restart agent - auto-reindexes
```

### Too Slow?
```bash
# Check codebase size
find . -name "*.py" | wc -l

# Force re-index may help
agent.initialize(force=True)
```

### Want Manual Control?
```python
# Disable auto-init (not recommended)
# Use environment variable
FORGE_AUTO_INDEX=false

# Then call manually when ready
agent.initialize()
```

## What Gets Indexed

✅ Python files (`.py`)
✅ Function/class definitions
✅ Semantic embeddings
✅ Call relationships
✅ Recent git history

## What Doesn't Get Cached

❌ VS Code workspace settings
❌ User preferences
❌ Runtime state
❌ External API calls

## Key Files

- **Implementation**: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
  - `__init__()` line 68
  - `_auto_initialize()` line 103
  - `_has_codebase_changed()` line 135
  - `_save_index_metadata()` line 167

- **Documentation**: 
  - Full guide: [`docs/AUTO_INDEXING.md`](AUTO_INDEXING.md)
  - This reference: [`docs/AUTO_INDEXING_QUICK_REFERENCE.md`](AUTO_INDEXING_QUICK_REFERENCE.md)

## Summary

| Action | When | Behavior |
|--------|------|----------|
| Create agent | First time | Indexes codebase |
| Create agent | Cache exists, no changes | Reuses cache |
| Create agent | Cache exists, changed | Re-indexes |
| Create agent | Embedding provider changed | Clears vectors, re-indexes |
| `initialize(force=True)` | Anytime | Full re-index |

**Result**: Forge "just works" without manual setup! 🚀

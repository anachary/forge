# Auto-Indexing Documentation

## Overview

Forge automatically indexes your codebase on first use and intelligently manages the index for optimal performance. **No manual configuration needed!**

## The Problem It Solves

Previously, users had to:
1. Create a ForgeAgent instance
2. Manually call `agent.initialize()`
3. Wait for indexing to complete
4. Manually handle re-indexing when code changed

**Now:** Just create the agent and start using it. Everything is automatic.

## How Auto-Indexing Works

### Phase 1: Agent Instantiation

```python
from forge.agent import ForgeAgent

agent = ForgeAgent("/path/to/codebase")
```

When ForgeAgent is created, it immediately triggers auto-initialization in the `__init__` method.

**Code Reference**: [`forge/agent/forge_agent.py::__init__`](../forge/agent/forge_agent.py#L68-L85)

### Phase 2: Auto-Initialization Check

The agent checks if the codebase has been indexed before by looking for `.forge/index_cache`:

```python
def _auto_initialize(self):
    cache_path = self.workspace / ".forge" / "index_cache"
    index_exists = cache_path.exists()
```

**Code Reference**: [`forge/agent/forge_agent.py::_auto_initialize`](../forge/agent/forge_agent.py#L103-L133)

### Phase 3a: New Codebase (First Time)

If no cache exists:

```
📦 New codebase detected: forge
   Indexing for the first time...
Initializing Forge...
  Indexing codebase...
✅ Ready!
```

**What happens:**
1. All Python files are scanned
2. Files are chunked at semantic boundaries
3. Embeddings are created
4. Call graph is built
5. Git history is loaded
6. Metadata is saved

**Time:** 10-30 seconds (depending on codebase size)

**Code Reference**: [`forge/agent/forge_agent.py::initialize`](../forge/agent/forge_agent.py#L88-L101)

### Phase 3b: Cached Codebase (Subsequent Runs)

If cache exists, auto-init checks if anything changed:

```python
def _has_codebase_changed(self) -> bool:
    # Compare current file count with cached count
    # Compare last modified timestamps
    # If anything changed, return True
```

**Code Reference**: [`forge/agent/forge_agent.py::_has_codebase_changed`](../forge/agent/forge_agent.py#L135-L165)

#### Scenario A: No Changes Detected

```
✅ Using cached index for forge
```

**What happens:**
- Existing index is reused
- Agent is ready immediately

**Time:** <100ms ⚡

#### Scenario B: Changes Detected

```
🔄 Codebase changed, re-indexing forge...
   (Files: 45 → 47)
Initializing Forge...
  Indexing codebase...
✅ Ready!
```

**What happens:**
- Files added/removed detected
- Full re-indexing triggered
- Metadata updated

**Time:** 10-30 seconds

**Code Reference**: [`forge/agent/forge_agent.py::_auto_initialize`](../forge/agent/forge_agent.py#L120-L127)

## Cache Structure

### Directory Layout

```
your-codebase/
├── .forge/                      # Auto-created on first index
│   ├── index_cache              # Empty file marking indexed status
│   ├── index_metadata.json      # Metadata for change detection
│   └── (index data files)
├── src/
├── tests/
└── README.md
```

### Metadata File

**Location:** `.forge/index_metadata.json`

**Content:**
```json
{
  "file_count": 127,
  "last_modified": 1703830500.245,
  "indexed_at": "2024-12-28T10:15:30.123456",
  "workspace": "C:\\Users\\akash\\code\\forge",
  "embedding_provider": "sentence-transformers"
}
```

**Updated:** Every time indexing happens.
**Note:** If `embedding_provider` changes between runs, the index is automatically cleared and rebuilt (different providers produce vectors with incompatible dimensions).

**Code Reference**: [`forge/agent/forge_agent.py::_save_index_metadata`](../forge/agent/forge_agent.py#L167-L199)

## Implementation Details

### Key Methods

#### 1. `_auto_initialize()`
- **Purpose**: Runs on agent creation
- **Responsibility**: Detect new vs cached codebase
- **Location**: [`forge/agent/forge_agent.py::L103-L133`](../forge/agent/forge_agent.py#L103-L133)

```python
def _auto_initialize(self):
    try:
        cache_path = self.workspace / ".forge" / "index_cache"
        index_exists = cache_path.exists()
        
        if not index_exists:
            # NEW codebase → Index now
            print(f"📦 New codebase detected: {self.workspace.name}")
            self.initialize(force=False)
        else:
            # EXISTING cache → Check for changes
            if self._has_codebase_changed():
                print(f"🔄 Codebase changed, re-indexing...")
                self.initialize(force=True)
            else:
                print(f"✅ Using cached index...")
                self._initialized = True
    except Exception as e:
        print(f"⚠️  Auto-initialization warning: {e}")
```

#### 2. `_has_codebase_changed()`
- **Purpose**: Smart change detection (files + embedding provider)
- **Responsibility**: Compare current state with cached metadata
- **Location**: [`forge/agent/forge_agent.py::_has_codebase_changed`](../forge/agent/forge_agent.py)

```python
def _has_codebase_changed(self) -> bool:
    try:
        cache_meta = self.workspace / ".forge" / "index_metadata.json"

        if not cache_meta.exists():
            return True  # No metadata → Changed

        # Get CACHED stats
        cached_meta = json.loads(cache_meta.read_text())

        # Check if embedding provider changed (vectors would be incompatible)
        cached_provider = cached_meta.get("embedding_provider", "ollama")
        if cached_provider != config.embedding_provider:
            self.retriever.vector_store.clear()
            return True

        # Get CURRENT stats
        current_files = list(self.workspace.rglob("*.py"))
        current_count = len(current_files)
        current_mtime = max((f.stat().st_mtime for f in current_files), default=0)

        cached_count = cached_meta.get("file_count", 0)
        cached_mtime = cached_meta.get("last_modified", 0)

        # COMPARE
        changed = current_count != cached_count or current_mtime > cached_mtime

        return changed
    except Exception:
        return False  # Safe default
```

#### 3. `_save_index_metadata()`
- **Purpose**: Persist metadata for future checks
- **Responsibility**: Save file stats and timestamps
- **Location**: [`forge/agent/forge_agent.py::L167-L199`](../forge/agent/forge_agent.py#L167-L199)

```python
def _save_index_metadata(self):
    try:
        from datetime import datetime
        
        forge_dir = self.workspace / ".forge"
        forge_dir.mkdir(exist_ok=True)
        
        # Mark as indexed
        cache_file = forge_dir / "index_cache"
        cache_file.touch()
        
        # Get current stats
        current_files = list(self.workspace.rglob("*.py"))
        
        # Build metadata
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
        
        # Save
        meta_file = forge_dir / "index_metadata.json"
        meta_file.write_text(json.dumps(metadata, indent=2))
        
    except Exception as e:
        print(f"⚠️  Could not save index metadata: {e}")
```

## Usage Patterns

### Pattern 1: Basic Usage (Recommended)

```python
from forge.agent import ForgeAgent

# Create agent - auto-indexes if needed
agent = ForgeAgent("/path/to/codebase")

# Start using immediately
response = agent.chat("Explain the authentication flow")
```

### Pattern 2: Force Re-Index

```python
from forge.agent import ForgeAgent

agent = ForgeAgent("/path/to/codebase")

# Force full re-index (even if cache exists)
agent.initialize(force=True)

response = agent.chat("...")
```

### Pattern 3: Check Initialization Status

```python
from forge.agent import ForgeAgent

agent = ForgeAgent("/path/to/codebase")

# Check if already initialized
if agent._initialized:
    print("Index is ready")
else:
    print("Still indexing...")
```

### Pattern 4: Multiple Codebases

```python
from forge.agent import ForgeAgent

# Each workspace gets its own cache
forge_agent = ForgeAgent("/path/to/forge")
myapp_agent = ForgeAgent("/path/to/myapp")

# Each indexes independently
forge_response = forge_agent.chat("...")
myapp_response = myapp_agent.chat("...")
```

## Performance Characteristics

### Time Breakdown

| Phase | Time | Notes |
|-------|------|-------|
| Agent instantiation | 100ms | Before indexing starts |
| First index | 10-30s | Full codebase scan |
| Change detection | 50ms | File stat comparison |
| Metadata save | <100ms | JSON write to disk |
| Cache hit | <100ms | Load existing index |

### Size Breakdown (Typical Codebase)

| Component | Size | Notes |
|-----------|------|-------|
| Index cache | 50-500MB | Vector embeddings (largest) |
| Metadata | <1KB | JSON file |
| Index files | 20-200MB | Chunk data |
| Total | ~50-700MB | Depends on codebase |

### Optimization Tips

1. **Skip small projects**: Indexing overhead > benefit
2. **Use `.forge/` in .gitignore**: Keep cache local
3. **Force re-index sparingly**: Most changes are auto-detected
4. **Monitor cache size**: Large codebases may need cleanup

## Error Handling

### What If Auto-Initialization Fails?

```
⚠️  Auto-initialization warning: [error details]
   You can manually call agent.initialize()
```

**Solutions:**
1. Check disk space (cache needs 50-700MB)
2. Delete `.forge/` directory and retry
3. Call `agent.initialize(force=True)` manually
4. Check file permissions

### Common Issues

**Issue:** "No such file or directory: .forge/index_metadata.json"
- **Cause**: Corrupted cache
- **Solution**: Delete `.forge/` directory, restart

**Issue:** "Indexing taking too long"
- **Cause**: Large codebase or slow disk
- **Solution**: Be patient (10-30s is normal), or use `--force` flag

**Issue:** "Out of memory during indexing"
- **Cause**: Very large codebase (>50K files)
- **Solution**: Index on machine with more RAM, or split codebase

## Configuration

### Environment Variables

```bash
# Control indexing behavior
FORGE_AUTO_INDEX=true         # Enable auto-indexing (default)
FORGE_INDEX_FORCE=false       # Don't force re-index on start
FORGE_CACHE_DIR=.forge        # Cache directory name
```

### Code Configuration

```python
from forge.config import config

# Disable auto-indexing (not recommended)
config.auto_index = False

# Change cache location
config.index_cache_dir = ".forge_cache"

# Change detection sensitivity
config.index_check_interval = 60  # seconds
```

## Migration Guide

### From Manual to Auto-Indexing

**Before:**
```python
agent = ForgeAgent(workspace)
agent.initialize()  # Manual step
response = agent.chat(query)
```

**After:**
```python
agent = ForgeAgent(workspace)  # Auto-indexes
response = agent.chat(query)
```

**What changes for me?**
- ✅ No code changes needed
- ✅ Backward compatible
- ✅ Faster subsequent loads
- ✅ Automatic re-indexing

### Existing Projects

If you have existing projects with manual indexing:

1. Update to new version
2. Delete old `.forge/` directory (if different structure)
3. Recreate agent
4. Auto-indexing kicks in automatically
5. Remove manual `agent.initialize()` calls (optional but recommended)

## Best Practices

### Do ✅

- Let auto-indexing run on first use
- Keep `.forge/` in `.gitignore`
- Use `.forge/` for cache management
- Call `initialize(force=True)` when deliberately making large changes
- Monitor cache size on large projects

### Don't ❌

- Don't manually delete `.forge/index_metadata.json` (delete entire `.forge/` instead)
- Don't commit `.forge/` to version control
- Don't force re-index on every startup
- Don't expect instant indexing on first use
- Don't use auto-indexing for very large codebases (>100K files) without preparation

## Troubleshooting

### Check Cache Status

```python
from pathlib import Path
import json

workspace = Path("/path/to/codebase")
meta_file = workspace / ".forge" / "index_metadata.json"

if meta_file.exists():
    metadata = json.loads(meta_file.read_text())
    print(f"Indexed at: {metadata['indexed_at']}")
    print(f"Files: {metadata['file_count']}")
else:
    print("Not yet indexed")
```

### Manually Trigger Re-Index

```python
from forge.agent import ForgeAgent

agent = ForgeAgent("/path/to/codebase")
agent.initialize(force=True)
```

### View Logs

```bash
# Enable debug logging
FORGE_DEBUG=1 forge chat
```

## References

- **File**: [`forge/agent/forge_agent.py`](../forge/agent/forge_agent.py)
- **Methods**: 
  - `_auto_initialize()` (Line 103-133)
  - `_has_codebase_changed()` (Line 135-165)
  - `_save_index_metadata()` (Line 167-199)
  - `initialize()` (Line 88-101)
- **Config**: [`forge/config.py`](../forge/config.py)

## Summary

Auto-indexing makes Forge **just work**:

- 📦 **New codebase?** Auto-indexes on first use
- ⚡ **Cached?** Reuses index instantly  
- 🔄 **Changed?** Re-indexes automatically
- ✅ **No manual steps needed**

Simply create an agent and start coding!

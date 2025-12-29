"""
Call graph analysis for understanding code relationships.

Builds a graph of function calls to understand:
- What calls what (callers/callees)
- Impact of changes
- Code navigation

Based on: "Interprocedural Slicing Using Dependence Graphs" (Horwitz et al., 1990)
"""

from pathlib import Path
from typing import Dict, List, Set, Optional
from dataclasses import dataclass, field
from collections import defaultdict

try:
    import tree_sitter_languages
    HAS_TREESITTER = True
except ImportError:
    HAS_TREESITTER = False


@dataclass
class Symbol:
    """A code symbol (function, class, method)."""
    name: str
    file_path: str
    line: int
    symbol_type: str  # "function", "class", "method"
    parent: Optional[str] = None  # For methods, the class name


@dataclass
class CallEdge:
    """An edge in the call graph."""
    caller: str  # Fully qualified name
    callee: str
    file_path: str
    line: int


class CallGraph:
    """
    Static call graph analysis.
    
    Builds a graph where:
    - Nodes are functions/methods
    - Edges are function calls
    
    Enables:
    - "Find all callers of X"
    - "Find all callees of X"  
    - "What's the impact of changing X?"
    
    Reference:
        Horwitz, S., Reps, T., & Binkley, D. (1990). Interprocedural Slicing 
        Using Dependence Graphs. ACM TOPLAS.
    """
    
    def __init__(self, workspace: str):
        self.workspace = Path(workspace)
        self.symbols: Dict[str, Symbol] = {}
        self.callers: Dict[str, Set[str]] = defaultdict(set)  # symbol -> set of callers
        self.callees: Dict[str, Set[str]] = defaultdict(set)  # symbol -> set of callees
        self._built = False
    
    def build(self, force: bool = False):
        """Build the call graph by analyzing all source files."""
        if self._built and not force:
            return
        
        self.symbols.clear()
        self.callers.clear()
        self.callees.clear()
        
        # Find all source files
        extensions = [".py", ".js", ".ts", ".go", ".rs", ".java"]
        for ext in extensions:
            for file_path in self.workspace.rglob(f"*{ext}"):
                if self._should_skip(file_path):
                    continue
                self._analyze_file(str(file_path))
        
        self._built = True
    
    def _should_skip(self, path: Path) -> bool:
        """Skip certain directories."""
        skip_dirs = {"node_modules", ".git", "__pycache__", "venv", ".venv", "dist", "build"}
        return any(part in skip_dirs for part in path.parts)
    
    _warned_treesitter = False

    def _analyze_file(self, file_path: str):
        """Analyze a single file for symbols and calls."""
        if not HAS_TREESITTER:
            if not CallGraph._warned_treesitter:
                print("⚠️  tree-sitter-languages not installed - call graph analysis disabled. Run: pip install tree-sitter-languages")
                CallGraph._warned_treesitter = True
            return
        
        path = Path(file_path)
        suffix = path.suffix.lower()
        
        lang_map = {".py": "python", ".js": "javascript", ".ts": "typescript", ".go": "go"}
        language = lang_map.get(suffix)
        
        if not language:
            return
        
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
            parser = tree_sitter_languages.get_parser(language)
            tree = parser.parse(content.encode())
            
            self._extract_symbols(tree.root_node, content, file_path, language)
            self._extract_calls(tree.root_node, content, file_path, language)
            
        except Exception as e:
            pass  # Skip files that fail to parse
    
    def _extract_symbols(self, node, content: str, file_path: str, language: str):
        """Extract function/class definitions."""
        symbol_types = {
            "function_definition": "function",
            "function_declaration": "function",
            "class_definition": "class",
            "class_declaration": "class",
            "method_definition": "method",
        }
        
        if node.type in symbol_types:
            name = self._get_name(node, content)
            if name:
                fqn = f"{file_path}::{name}"
                self.symbols[fqn] = Symbol(
                    name=name,
                    file_path=file_path,
                    line=node.start_point[0] + 1,
                    symbol_type=symbol_types[node.type],
                )
        
        for child in node.children:
            self._extract_symbols(child, content, file_path, language)
    
    def _extract_calls(self, node, content: str, file_path: str, language: str):
        """Extract function calls."""
        if node.type == "call":
            callee_name = self._get_call_name(node, content)
            if callee_name:
                # Find the enclosing function
                caller = self._find_enclosing_function(node, content, file_path)
                if caller:
                    self.callers[callee_name].add(caller)
                    self.callees[caller].add(callee_name)
        
        for child in node.children:
            self._extract_calls(child, content, file_path, language)
    
    def _get_name(self, node, content: str) -> Optional[str]:
        """Get the name identifier from a node."""
        for child in node.children:
            if child.type in ["identifier", "name"]:
                return content[child.start_byte:child.end_byte]
        return None
    
    def _get_call_name(self, node, content: str) -> Optional[str]:
        """Get the function name from a call node."""
        for child in node.children:
            if child.type in ["identifier", "attribute"]:
                return content[child.start_byte:child.end_byte]
        return None
    
    def _find_enclosing_function(self, node, content: str, file_path: str) -> Optional[str]:
        """Find the function that contains this node."""
        current = node.parent
        while current:
            if current.type in ["function_definition", "function_declaration", "method_definition"]:
                name = self._get_name(current, content)
                if name:
                    return f"{file_path}::{name}"
            current = current.parent
        return None
    
    def get_callers(self, symbol: str) -> List[str]:
        """Get all functions that call this symbol."""
        return list(self.callers.get(symbol, set()))
    
    def get_callees(self, symbol: str) -> List[str]:
        """Get all functions called by this symbol."""
        return list(self.callees.get(symbol, set()))
    
    def get_impact(self, symbol: str, depth: int = 2) -> Set[str]:
        """Get all symbols impacted by changing this one (transitive callers)."""
        impacted = set()
        frontier = {symbol}
        
        for _ in range(depth):
            new_frontier = set()
            for s in frontier:
                for caller in self.callers.get(s, set()):
                    if caller not in impacted:
                        impacted.add(caller)
                        new_frontier.add(caller)
            frontier = new_frontier
        
        return impacted


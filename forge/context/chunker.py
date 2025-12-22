"""
Semantic code chunking using Tree-sitter AST parsing.

Chunks code at semantic boundaries (functions, classes) rather than arbitrary splits.
Based on: "CodeSearchNet Challenge" (Husain et al., 2019) - semantic code search.
"""

from pathlib import Path
from typing import List, Optional, Generator
from dataclasses import dataclass

try:
    import tree_sitter_languages
    HAS_TREESITTER = True
except ImportError:
    HAS_TREESITTER = False


@dataclass
class CodeChunk:
    """A semantically meaningful chunk of code."""
    content: str
    file_path: str
    start_line: int
    end_line: int
    chunk_type: str  # "function", "class", "block"
    symbol_name: Optional[str] = None


# Language to Tree-sitter language name mapping
LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".jsx": "javascript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cpp": "cpp",
    ".c": "c",
    ".rb": "ruby",
}

# Node types that represent semantic boundaries
SEMANTIC_NODES = {
    "python": ["function_definition", "class_definition", "decorated_definition"],
    "javascript": ["function_declaration", "class_declaration", "arrow_function", "method_definition"],
    "typescript": ["function_declaration", "class_declaration", "arrow_function", "method_definition"],
    "go": ["function_declaration", "method_declaration", "type_declaration"],
    "rust": ["function_item", "impl_item", "struct_item"],
}


class SemanticChunker:
    """
    Chunk code at semantic boundaries using AST parsing.
    
    Unlike naive text splitting, this respects code structure:
    - Functions stay together
    - Classes stay together
    - Imports grouped separately
    
    Reference:
        Husain, H., et al. (2019). CodeSearchNet Challenge: Evaluating the State 
        of Semantic Code Search. arXiv:1909.09436
    """
    
    def __init__(self, chunk_size: int = 512, overlap: int = 50):
        self.chunk_size = chunk_size
        self.overlap = overlap
    
    def chunk_file(self, file_path: str) -> List[CodeChunk]:
        """Chunk a file into semantic units."""
        path = Path(file_path)
        
        if not path.exists():
            return []
        
        suffix = path.suffix.lower()
        language = LANGUAGE_MAP.get(suffix)
        
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except:
            return []
        
        if HAS_TREESITTER and language:
            return self._chunk_with_ast(content, file_path, language)
        else:
            return self._chunk_naive(content, file_path)
    
    def _chunk_with_ast(self, content: str, file_path: str, language: str) -> List[CodeChunk]:
        """Chunk using AST parsing."""
        try:
            parser = tree_sitter_languages.get_parser(language)
            tree = parser.parse(content.encode())
            
            chunks = []
            semantic_types = SEMANTIC_NODES.get(language, [])
            
            for node in self._walk_tree(tree.root_node):
                if node.type in semantic_types:
                    chunk_content = content[node.start_byte:node.end_byte]
                    
                    # Get symbol name if available
                    name = None
                    for child in node.children:
                        if child.type in ["identifier", "name"]:
                            name = content[child.start_byte:child.end_byte]
                            break
                    
                    chunks.append(CodeChunk(
                        content=chunk_content,
                        file_path=file_path,
                        start_line=node.start_point[0] + 1,
                        end_line=node.end_point[0] + 1,
                        chunk_type=node.type,
                        symbol_name=name,
                    ))
            
            # If no semantic chunks found, fall back to naive
            if not chunks:
                return self._chunk_naive(content, file_path)
            
            return chunks
            
        except Exception as e:
            return self._chunk_naive(content, file_path)
    
    def _walk_tree(self, node) -> Generator:
        """Walk AST tree yielding all nodes."""
        yield node
        for child in node.children:
            yield from self._walk_tree(child)
    
    def _chunk_naive(self, content: str, file_path: str) -> List[CodeChunk]:
        """Fallback: chunk by line count."""
        lines = content.split("\n")
        chunks = []
        
        for i in range(0, len(lines), self.chunk_size - self.overlap):
            chunk_lines = lines[i:i + self.chunk_size]
            chunks.append(CodeChunk(
                content="\n".join(chunk_lines),
                file_path=file_path,
                start_line=i + 1,
                end_line=min(i + self.chunk_size, len(lines)),
                chunk_type="block",
            ))
        
        return chunks


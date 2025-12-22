"""
Web search using DuckDuckGo (free, no API key).

Provides web search capability for external information.
"""

import re
import urllib.parse
from typing import List, Optional
from dataclasses import dataclass

try:
    import requests
    from bs4 import BeautifulSoup
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


@dataclass
class SearchResult:
    """A search result."""
    title: str
    url: str
    snippet: str


class WebSearch:
    """
    DuckDuckGo web search - free, no API key required.
    
    Used for:
    - External documentation lookup
    - Version/release information
    - Best practices research
    - Comparing technologies
    """
    
    SEARCH_URL = "https://html.duckduckgo.com/html/"
    
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    def __init__(self, max_results: int = 5, timeout: int = 10):
        self.max_results = max_results
        self.timeout = timeout
    
    def search(self, query: str, max_results: Optional[int] = None) -> List[SearchResult]:
        """Search DuckDuckGo and return results."""
        if not HAS_DEPS:
            return []
        
        limit = max_results or self.max_results
        
        try:
            response = requests.post(
                self.SEARCH_URL,
                data={"q": query, "b": ""},
                headers=self.HEADERS,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return self._parse_results(response.text, limit)
        except Exception as e:
            print(f"Web search error: {e}")
            return []
    
    def _parse_results(self, html: str, limit: int) -> List[SearchResult]:
        """Parse search results from HTML."""
        soup = BeautifulSoup(html, "html.parser")
        results = []
        
        for result in soup.select(".result"):
            if len(results) >= limit:
                break
            
            title_elem = result.select_one(".result__a")
            if not title_elem:
                continue
            
            title = title_elem.get_text(strip=True)
            href = title_elem.get("href", "")
            url = self._extract_url(href)
            
            if not url:
                continue
            
            snippet_elem = result.select_one(".result__snippet")
            snippet = snippet_elem.get_text(strip=True) if snippet_elem else ""
            
            results.append(SearchResult(title=title, url=url, snippet=snippet))
        
        return results
    
    def _extract_url(self, href: str) -> Optional[str]:
        """Extract actual URL from DuckDuckGo redirect."""
        if not href:
            return None
        
        match = re.search(r'uddg=([^&]+)', href)
        if match:
            return urllib.parse.unquote(match.group(1))
        
        if href.startswith("http"):
            return href
        
        return None
    
    def search_formatted(self, query: str, max_results: Optional[int] = None) -> str:
        """Search and return formatted markdown."""
        results = self.search(query, max_results)
        
        if not results:
            return f"No web results found for: {query}"
        
        lines = [f"**Web results for: {query}**\n"]
        
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. **[{r.title}]({r.url})**")
            if r.snippet:
                lines.append(f"   {r.snippet}\n")
        
        return "\n".join(lines)


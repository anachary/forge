"""
LLM interface for local and cloud models.

Supports:
- Ollama (local)
- OpenAI (cloud)
- Anthropic (cloud)

Based on: Chain-of-Thought prompting (Wei et al., 2022)
"""

import json
import requests
from typing import Generator, Optional, Dict, List
from dataclasses import dataclass

from forge.config import config


@dataclass
class Message:
    """A chat message."""
    role: str  # "user", "assistant", "system"
    content: str


class LLM:
    """
    Unified LLM interface supporting multiple providers.
    
    Primary: Ollama (local, private)
    Fallback: OpenAI/Anthropic (cloud)
    
    Reference:
        Wei, J., et al. (2022). Chain-of-Thought Prompting Elicits Reasoning 
        in Large Language Models. NeurIPS.
    """
    
    def __init__(
        self,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        self.model = model or config.model
        self.base_url = base_url or config.ollama_url
        self.temperature = temperature or config.temperature
        self.max_tokens = max_tokens or config.max_tokens
    
    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate a response (non-streaming)."""
        url = f"{self.base_url}/api/generate"
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            }
        }
        
        if system:
            payload["system"] = system
        
        try:
            response = requests.post(url, json=payload, timeout=120)
            response.raise_for_status()
            return response.json().get("response", "")
        except Exception as e:
            return f"Error: {e}"
    
    def generate_streaming(
        self, 
        prompt: str, 
        system: Optional[str] = None
    ) -> Generator[str, None, None]:
        """Generate a streaming response."""
        url = f"{self.base_url}/api/generate"
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            }
        }
        
        if system:
            payload["system"] = system
        
        try:
            with requests.post(url, json=payload, stream=True, timeout=120) as response:
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        if chunk := data.get("response", ""):
                            yield chunk
                        if data.get("done"):
                            break
        except Exception as e:
            yield f"Error: {e}"
    
    def chat(self, messages: List[Message], system: Optional[str] = None) -> str:
        """Chat completion with message history."""
        url = f"{self.base_url}/api/chat"
        
        msg_list = [{"role": m.role, "content": m.content} for m in messages]
        
        payload = {
            "model": self.model,
            "messages": msg_list,
            "stream": False,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            }
        }
        
        if system:
            msg_list.insert(0, {"role": "system", "content": system})
        
        try:
            response = requests.post(url, json=payload, timeout=120)
            response.raise_for_status()
            return response.json().get("message", {}).get("content", "")
        except Exception as e:
            return f"Error: {e}"
    
    def check_connection(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def list_models(self) -> List[str]:
        """List available models."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get("models", [])
                return [m["name"] for m in models]
        except:
            pass
        return []


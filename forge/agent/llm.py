"""
LLM interface for local and cloud models.

Supports:
- Ollama (local)
- Anthropic Claude (cloud)
- OpenAI (cloud)

Based on: Chain-of-Thought prompting (Wei et al., 2022)
"""

import json
import requests
from typing import Generator, Optional, Dict, List
from dataclasses import dataclass

from forge.config import config


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


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
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.provider = provider or config.provider
        self.base_url = base_url or config.ollama_url
        self.temperature = temperature or config.temperature
        self.max_tokens = max_tokens or config.max_tokens

        # Resolve model and API key based on provider
        if self.provider == "claude":
            self.model = model or config.claude_model
            self.api_key = api_key or config.anthropic_api_key
        elif self.provider == "openai":
            self.model = model or config.openai_model
            self.api_key = api_key or config.openai_api_key
        else:
            self.model = model or config.model
            self.api_key = api_key or ""

    def _require_api_key(self):
        """Raise an error if the API key is not set."""
        if not self.api_key:
            provider_name = "Anthropic" if self.provider == "claude" else "OpenAI"
            env_var = "ANTHROPIC_API_KEY" if self.provider == "claude" else "OPENAI_API_KEY"
            raise ValueError(
                f"{provider_name} API key not set. "
                f"Set {env_var} environment variable or pass --api-key."
            )

    # ------------------------------------------------------------------
    # Public methods — dispatch by provider
    # ------------------------------------------------------------------

    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """Generate a response (non-streaming)."""
        if self.provider == "claude":
            return self._generate_claude(prompt, system)
        return self._generate_ollama(prompt, system)

    def generate_streaming(
        self,
        prompt: str,
        system: Optional[str] = None,
    ) -> Generator[str, None, None]:
        """Generate a streaming response."""
        if self.provider == "claude":
            yield from self._generate_streaming_claude(prompt, system)
        else:
            yield from self._generate_streaming_ollama(prompt, system)

    def chat(self, messages: List[Message], system: Optional[str] = None) -> str:
        """Chat completion with message history."""
        if self.provider == "claude":
            return self._chat_claude(messages, system)
        return self._chat_ollama(messages, system)

    def check_connection(self) -> bool:
        """Check if the configured provider is available."""
        if self.provider == "claude":
            return self._check_connection_claude()
        return self._check_connection_ollama()

    def list_models(self) -> List[str]:
        """List available models (Ollama only)."""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get("models", [])
                return [m["name"] for m in models]
        except:
            pass
        return []

    # ------------------------------------------------------------------
    # Ollama implementation
    # ------------------------------------------------------------------

    def _generate_ollama(self, prompt: str, system: Optional[str] = None) -> str:
        url = f"{self.base_url}/api/generate"

        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            },
        }

        if system:
            payload["system"] = system

        try:
            response = requests.post(url, json=payload, timeout=120)
            response.raise_for_status()
            return response.json().get("response", "")
        except Exception as e:
            return f"Error: {e}"

    def _generate_streaming_ollama(
        self, prompt: str, system: Optional[str] = None
    ) -> Generator[str, None, None]:
        url = f"{self.base_url}/api/generate"

        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            },
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

    def _chat_ollama(self, messages: List[Message], system: Optional[str] = None) -> str:
        url = f"{self.base_url}/api/chat"

        msg_list = [{"role": m.role, "content": m.content} for m in messages]

        payload = {
            "model": self.model,
            "messages": msg_list,
            "stream": False,
            "options": {
                "temperature": self.temperature,
                "num_predict": self.max_tokens,
            },
        }

        if system:
            msg_list.insert(0, {"role": "system", "content": system})

        try:
            response = requests.post(url, json=payload, timeout=120)
            response.raise_for_status()
            return response.json().get("message", {}).get("content", "")
        except Exception as e:
            return f"Error: {e}"

    def _check_connection_ollama(self) -> bool:
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False

    # ------------------------------------------------------------------
    # Anthropic Claude implementation
    # ------------------------------------------------------------------

    def _claude_headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    def _generate_claude(self, prompt: str, system: Optional[str] = None) -> str:
        self._require_api_key()

        payload: Dict = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system

        try:
            response = requests.post(
                ANTHROPIC_API_URL,
                headers=self._claude_headers(),
                json=payload,
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()
            # Extract text from content blocks
            blocks = data.get("content", [])
            return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        except requests.exceptions.HTTPError as e:
            return f"Error: Anthropic API returned {e.response.status_code} — {e.response.text}"
        except Exception as e:
            return f"Error: {e}"

    def _generate_streaming_claude(
        self, prompt: str, system: Optional[str] = None
    ) -> Generator[str, None, None]:
        self._require_api_key()

        payload: Dict = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "stream": True,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system

        try:
            with requests.post(
                ANTHROPIC_API_URL,
                headers=self._claude_headers(),
                json=payload,
                stream=True,
                timeout=120,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    decoded = line.decode("utf-8") if isinstance(line, bytes) else line
                    if not decoded.startswith("data: "):
                        continue
                    json_str = decoded[len("data: "):]
                    if json_str.strip() == "[DONE]":
                        break
                    try:
                        event = json.loads(json_str)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta", {})
                        if text := delta.get("text", ""):
                            yield text
                    elif event.get("type") == "message_stop":
                        break
        except requests.exceptions.HTTPError as e:
            yield f"Error: Anthropic API returned {e.response.status_code} — {e.response.text}"
        except Exception as e:
            yield f"Error: {e}"

    def _chat_claude(self, messages: List[Message], system: Optional[str] = None) -> str:
        self._require_api_key()

        # Anthropic expects alternating user/assistant messages; system is top-level.
        msg_list = []
        for m in messages:
            if m.role == "system":
                # Fold system messages into the system param
                if not system:
                    system = m.content
                continue
            msg_list.append({"role": m.role, "content": m.content})

        payload: Dict = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": msg_list,
        }
        if system:
            payload["system"] = system

        try:
            response = requests.post(
                ANTHROPIC_API_URL,
                headers=self._claude_headers(),
                json=payload,
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()
            blocks = data.get("content", [])
            return "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        except requests.exceptions.HTTPError as e:
            return f"Error: Anthropic API returned {e.response.status_code} — {e.response.text}"
        except Exception as e:
            return f"Error: {e}"

    def _check_connection_claude(self) -> bool:
        """Test Claude connectivity with a minimal API call."""
        if not self.api_key:
            return False
        try:
            payload = {
                "model": self.model,
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            }
            response = requests.post(
                ANTHROPIC_API_URL,
                headers=self._claude_headers(),
                json=payload,
                timeout=10,
            )
            return response.status_code == 200
        except:
            return False

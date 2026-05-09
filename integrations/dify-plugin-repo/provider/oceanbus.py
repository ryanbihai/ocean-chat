from typing import Any
from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError


class OceanBusProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        api_key = credentials.get("api_key", "").strip()
        if not api_key:
            raise ToolProviderCredentialValidationError("API Key is required")
        if not api_key.startswith("sk_"):
            raise ToolProviderCredentialValidationError("API Key must start with sk_")

        # Test connectivity by calling /agents/me
        import httpx
        try:
            resp = httpx.get(
                "https://ai-t.ihaola.com.cn/api/l0/agents/me",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15,
            )
            if resp.status_code == 401:
                raise ToolProviderCredentialValidationError("Invalid API Key (401 Unauthorized)")
        except httpx.RequestError as e:
            raise ToolProviderCredentialValidationError(f"Cannot reach OceanBus: {e}")

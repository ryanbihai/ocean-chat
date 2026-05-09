from typing import Any
from dify_plugin.errors.tool import ToolProviderCredentialValidationError
from dify_plugin import ToolProvider
import httpx


class OpenAIProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        """
            Validate the credentials for the Skyrouter tool provider.
            This method checks if the credentials are valid by making a request to the Skyrouter endpoint.
        """
        endpoint = credentials.get("skyrouter_endpoint")
        apiKey = credentials.get("skyrouter_api_key")

        try:
            with httpx.Client(
                headers={
                    "Authorization": f"Bearer {apiKey}"
                },
                timeout=None,
            ) as client:
                response = client.post(f"{endpoint}/images/generations", json={
                    "prompt": "hello kitty",
                    "n": 1,
                    "size": "1024x1024",
                    "quality": "low",
                })
            if response.status_code != 200:
                raise ToolProviderCredentialValidationError("Invalid credentials")
            return True
        except Exception as e:
            raise ToolProviderCredentialValidationError(str(e))
from collections.abc import Generator
from typing import Any
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from ._client import l0_send_message


class SendMessageTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        api_key = self.runtime.credentials["api_key"]
        result = l0_send_message(api_key, tool_parameters["to_openid"], tool_parameters["content"])
        if result.get("code") != 0:
            yield self.create_text_message(f"Send failed: {result.get('msg')}")
            return
        yield self.create_json_message({"status": "delivered"})

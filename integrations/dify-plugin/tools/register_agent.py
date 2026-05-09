from collections.abc import Generator
from typing import Any
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from ._client import l0_register


class RegisterAgentTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        result = l0_register("")
        if result.get("code") != 0:
            yield self.create_text_message(f"Register failed: {result.get('msg')}")
            return
        data = result["data"]
        yield self.create_json_message({
            "agent_id": data["agent_id"],
            "api_key": data["api_key"],
            "message": "Go to OceanBus tool credentials and update your API Key to this new key.",
        })

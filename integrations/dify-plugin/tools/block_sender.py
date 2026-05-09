from collections.abc import Generator
from typing import Any
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from ._client import l0_block


class BlockSenderTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        api_key = self.runtime.credentials["api_key"]
        result = l0_block(api_key, tool_parameters["from_openid"])
        if result.get("code") != 0:
            yield self.create_text_message(f"Block failed: {result.get('msg')}")
            return
        yield self.create_json_message({"status": "blocked"})

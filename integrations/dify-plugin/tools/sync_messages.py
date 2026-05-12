from collections.abc import Generator
from typing import Any
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from ._client import l0_sync


class SyncMessagesTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        api_key = self.runtime.credentials["api_key"]
        since_seq = int(tool_parameters.get("since_seq", 0))
        limit = min(int(tool_parameters.get("limit", 10)), 500)

        result = l0_sync(api_key, since_seq, limit)
        if result.get("code") != 0:
            yield self.create_text_message(f"Sync failed: {result.get('msg')}")
            return

        data = result.get("data", {})
        messages = data.get("messages", [])
        max_seq = max((m["seq_id"] for m in messages), default=since_seq)
        yield self.create_json_message({
            "messages": messages,
            "count": len(messages),
            "has_more": data.get("has_more", False),
            "max_seq_id": max_seq,
        })

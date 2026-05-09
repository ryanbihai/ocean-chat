from collections.abc import Generator
from typing import Any
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from ._client import l1_request, YP_OPENID


class DiscoverYellowPagesTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        api_key = self.runtime.credentials["api_key"]
        tags_raw = tool_parameters.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
        limit = min(int(tool_parameters.get("limit", 20)), 500)

        result = l1_request(api_key, YP_OPENID, "discover",
                            {"tags": tags, "limit": limit, "cursor": None}, timeout=25)

        if result.get("code") != 0:
            yield self.create_text_message(f"Discover failed: {result.get('msg')}")
            return

        data = result.get("data", {})
        yield self.create_json_message({
            "entries": data.get("entries", []),
            "total": data.get("total", 0),
            "next_cursor": data.get("next_cursor"),
        })

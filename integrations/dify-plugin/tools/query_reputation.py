from collections.abc import Generator
from typing import Any
from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage
from ._client import l1_request, REP_OPENID


class QueryReputationTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        api_key = self.runtime.credentials["api_key"]
        openids_raw = tool_parameters.get("openids", "")
        openids = [o.strip() for o in openids_raw.split(",") if o.strip()]

        if not openids:
            yield self.create_text_message("At least one OpenID required")
            return
        if len(openids) > 100:
            yield self.create_text_message("Maximum 100 OpenIDs per query")
            return

        result = l1_request(api_key, REP_OPENID, "query_reputation",
                            {"openids": openids}, timeout=25)

        if result.get("code") != 0:
            yield self.create_text_message(f"Reputation query failed: {result.get('msg')}")
            return

        yield self.create_json_message({"results": result.get("data", {}).get("results", [])})

import os
import unittest
from unittest.mock import patch

import jwt

from main import ChatRequest, chat


class FakeResponse:
    status_code = 200
    is_success = True
    headers = {"x-request-id": "groq-test-request"}

    def __init__(self, tool_name=None, available_tools=None):
        self.tool_name = tool_name
        self.available_tools = available_tools or []

    def json(self):
        output = []
        if self.available_tools:
            output.append({
                "type": "mcp_list_tools", "server_label": "github",
                "tools": [{"name": name} for name in self.available_tools],
            })
        if self.tool_name:
            output.append({"type": "mcp_call", "server_label": "github", "name": self.tool_name, "output": "ok"})
        return {"id": "resp-test", "output_text": "Smoke test answer.", "output": output}


class FakeAsyncClient:
    request_body = None
    requests = []
    retry_on_first = False

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, _url, *, json, **_kwargs):
        FakeAsyncClient.request_body = json
        FakeAsyncClient.requests.append(json)
        tools = json.get("tools", [])
        available = tools[0].get("allowed_tools", []) if tools else []
        should_call = not (FakeAsyncClient.retry_on_first and len(FakeAsyncClient.requests) == 1)
        tool_name = available[0] if available and should_call else None
        return FakeResponse(tool_name, available)


class ChatSmokeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        FakeAsyncClient.requests = []
        FakeAsyncClient.retry_on_first = False
        self.user_id = "smoke-test-user"
        self.authorization = "Bearer " + jwt.encode(
            {"sub": self.user_id, "iss": "queue-t-pies"},
            os.environ["JWT_SECRET"],
            algorithm="HS256",
        )

    async def call_chat(self, payload):
        with patch("main.httpx.AsyncClient", FakeAsyncClient):
            return await chat(payload, self.authorization)

    async def test_greeting_does_not_attach_mcp(self):
        result = await self.call_chat(ChatRequest(user_id=self.user_id, message="hello", github_mode="none"))
        self.assertTrue(result["answer"])
        self.assertNotIn("tools", FakeAsyncClient.request_body)
        self.assertNotIn("tool_choice", FakeAsyncClient.request_body)

    async def test_repository_listing_requires_repository_search_tool(self):
        result = await self.call_chat(ChatRequest(
            user_id=self.user_id, message="list my repositories", github_mode="list",
            github_login="smoke-user", github_access_token="test-token",
            accessible_repositories=["smoke-user/example"],
        ))
        self.assertTrue(result["answer"])
        self.assertEqual(FakeAsyncClient.request_body["tools"][0]["server_url"], "https://api.githubcopilot.com/mcp/x/repos/readonly")
        self.assertEqual(FakeAsyncClient.request_body["tools"][0]["allowed_tools"], ["search_repositories"])
        self.assertNotIn("tool_choice", FakeAsyncClient.request_body)

    async def test_go_search_requires_search_code_tool(self):
        result = await self.call_chat(ChatRequest(
            user_id=self.user_id, message="which selected repos contain Go", github_mode="code",
            selected_repositories=["smoke-user/example"], github_access_token="test-token",
        ))
        self.assertTrue(result["answer"])
        self.assertEqual(FakeAsyncClient.request_body["tools"][0]["allowed_tools"], ["search_code", "get_file_contents", "search_repositories", "get_repository"])
        self.assertIn("never request or inspect private repositories", FakeAsyncClient.request_body["instructions"])
        self.assertIn("skip it, do not retry", FakeAsyncClient.request_body["instructions"])
        self.assertNotIn("tool_choice", FakeAsyncClient.request_body)

    async def test_repository_tool_miss_retries_after_successful_discovery(self):
        FakeAsyncClient.retry_on_first = True
        result = await self.call_chat(ChatRequest(
            user_id=self.user_id, message="find Go code", github_mode="code",
            selected_repositories=["smoke-user/example"], github_access_token="test-token",
        ))
        self.assertTrue(result["answer"])
        self.assertEqual(len(FakeAsyncClient.requests), 2)
        self.assertIn("IMPORTANT RETRY", FakeAsyncClient.requests[1]["instructions"])


if __name__ == "__main__":
    unittest.main()

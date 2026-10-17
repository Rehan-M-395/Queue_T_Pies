import os
import unittest
from unittest.mock import patch

import jwt

from main import ChatRequest, _fetch_public_portfolio_sources, _resolve_public_repositories, chat


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


class FakePublicGitHubResponse:
    def __init__(self, status_code, body=None, content=b""):
        self.status_code = status_code
        self._body = body
        self.content = content

    def json(self):
        return self._body


class FakePublicGitHubClient:
    def __init__(self):
        self.requests = []

    async def get(self, url, **kwargs):
        self.requests.append((url, kwargs))
        if "api.github.com" in url:
            return FakePublicGitHubResponse(200, {
                "tree": [
                    {"type": "blob", "path": "src/main.py", "size": 20},
                    {"type": "blob", "path": "README.md", "size": 10},
                ],
            })
        return FakePublicGitHubResponse(200, content=b"print('public source')\n")


class FakePublicRepositoryResolver:
    def __init__(self):
        self.requests = []

    async def get(self, url, **kwargs):
        self.requests.append((url, kwargs))
        if url.endswith("/public-owner/public-project"):
            return FakePublicGitHubResponse(200, {
                "private": False,
                "full_name": "public-owner/public-project",
                "html_url": "https://github.com/public-owner/public-project",
                "default_branch": "main",
            })
        if url.endswith("/public-owner/public-project/commits/main"):
            return FakePublicGitHubResponse(200, {"sha": "b" * 40})
        if url.endswith("/private-owner/private-project"):
            return FakePublicGitHubResponse(200, {
                "private": True,
                "full_name": "private-owner/private-project",
                "html_url": "https://github.com/private-owner/private-project",
                "default_branch": "main",
            })
        raise AssertionError(f"Unexpected GitHub URL: {url}")


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

    async def test_repository_listing_uses_backend_public_inventory(self):
        result = await self.call_chat(ChatRequest(
            user_id=self.user_id, message="list my repositories", github_mode="list",
            github_login="smoke-user",
            accessible_repositories=["smoke-user/example"],
        ))
        self.assertTrue(result["answer"])
        self.assertNotIn("tools", FakeAsyncClient.request_body)
        self.assertIn("Accessible repository inventory", FakeAsyncClient.request_body["instructions"])

    async def test_repository_question_uses_public_source_excerpts(self):
        repositories = [{
            "full_name": "smoke-user/example",
            "html_url": "https://github.com/smoke-user/example",
            "default_branch": "main",
            "head_sha": "a" * 40,
        }]
        source_files = [{
            "repository": "smoke-user/example", "path": "main.go", "commit_sha": "a" * 40,
            "content": "1: package main",
        }]
        with patch("main._resolve_public_repositories", return_value=repositories), patch(
            "main._fetch_public_portfolio_sources", return_value=(source_files, {}),
        ):
            result = await self.call_chat(ChatRequest(
                user_id=self.user_id, message="which selected repos contain Go", github_mode="code",
                github_login="smoke-user", selected_repositories=["smoke-user/example"],
            ))
        self.assertTrue(result["answer"])
        self.assertNotIn("tools", FakeAsyncClient.request_body)
        self.assertIn("public_source_excerpts", FakeAsyncClient.request_body["input"][-1]["content"])
        self.assertIn("Never access private repositories", FakeAsyncClient.request_body["instructions"])

    async def test_repository_question_does_not_call_github_mcp(self):
        FakeAsyncClient.retry_on_first = True
        with patch("main._resolve_public_repositories", return_value=[]), patch(
            "main._fetch_public_portfolio_sources", return_value=([], {}),
        ):
            result = await self.call_chat(ChatRequest(
                user_id=self.user_id, message="find Go code", github_mode="code",
                github_login="smoke-user", selected_repositories=["smoke-user/example"],
            ))
        self.assertTrue(result["answer"])
        self.assertEqual(len(FakeAsyncClient.requests), 1)
        self.assertNotIn("tools", FakeAsyncClient.request_body)


class PublicRepositorySourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolver_keeps_only_public_repositories_without_credentials(self):
        client = FakePublicRepositoryResolver()
        repositories = await _resolve_public_repositories(
            client,
            ["public-owner/public-project", "private-owner/private-project"],
        )

        self.assertEqual([repo["full_name"] for repo in repositories], ["public-owner/public-project"])
        self.assertEqual(repositories[0]["head_sha"], "b" * 40)
        self.assertFalse(any("private-project/commits" in request[0] for request in client.requests))
        self.assertTrue(all("Authorization" not in request[1].get("headers", {}) for request in client.requests))

    async def test_portfolio_source_fetch_uses_public_raw_urls_without_credentials(self):
        client = FakePublicGitHubClient()
        repositories = [{
            "full_name": "public-owner/project",
            "head_sha": "a" * 40,
        }]
        sources, limitations = await _fetch_public_portfolio_sources(
            client, repositories, [{"name": "Python"}],
        )

        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["path"], "src/main.py")
        self.assertIn("raw.githubusercontent.com/public-owner/project/" + "a" * 40, client.requests[1][0])
        self.assertTrue(all("Authorization" not in request[1].get("headers", {}) for request in client.requests))
        self.assertEqual(limitations, {})


if __name__ == "__main__":
    unittest.main()

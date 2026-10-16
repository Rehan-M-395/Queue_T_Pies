"""FastAPI agent service that calls Groq with GitHub's remote read-only MCP."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / "python-backend" / ".env")
load_dotenv(PROJECT_ROOT / "backend" / ".env")

app = FastAPI(title="Queue_T_Pies AI Analysis", docs_url=None, redoc_url=None)
GROQ_API_URL = "https://api.groq.com/openai/v1/responses"
GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/readonly"


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1500)


class ChatRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=3000)
    history: list[ChatTurn] = Field(default_factory=list, max_length=10)
    selected_repositories: list[str] = Field(default_factory=list, max_length=100)
    github_access_token: str | None = Field(default=None, max_length=8192)


def require_session_user(authorization: str | None, expected_user_id: str) -> None:
    jwt_secret = os.getenv("JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(status_code=503, detail="AI Analysis authentication is not configured.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to continue.")

    try:
        claims = jwt.decode(
            authorization[7:],
            jwt_secret,
            algorithms=["HS256"],
            issuer="queue-t-pies",
        )
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Your session is invalid or expired.") from error

    if claims.get("sub") != expected_user_id:
        raise HTTPException(status_code=403, detail="The session does not match this account.")


def response_text(payload: dict) -> str:
    direct_text = payload.get("output_text")
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text.strip()

    chunks: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks).strip()


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/chat")
async def chat(
    payload: ChatRequest,
    authorization: str | None = Header(default=None),
) -> dict:
    require_session_user(authorization, payload.user_id)
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise HTTPException(status_code=503, detail="Groq is not configured on the AI service.")

    selected_repositories = payload.selected_repositories if payload.github_access_token else []
    system_prompt = "\n\n".join(
        [
            "You are Queue_T_Pies AI Career Coach. Help with career questions and, when relevant, analyze the user's selected GitHub repositories using read-only GitHub tools.",
            (
                "The user's selected repositories are: "
                + ", ".join(selected_repositories)
                + ". Use GitHub tools only for these repositories. Cite repository names and file paths for repository claims. If you cannot verify a claim, say so."
                if selected_repositories
                else "No GitHub repositories are currently selected or connected. Do not claim to have inspected a repository; answer career questions generally and tell the user to connect GitHub and select repositories for code analysis."
            ),
            "Never modify repositories or perform write actions.",
        ]
    )
    conversation = [
        {"role": "system", "content": system_prompt},
        *[turn.model_dump() for turn in payload.history],
        {"role": "user", "content": payload.message},
    ]
    groq_request = {
        "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        "input": conversation,
        "max_output_tokens": 1200,
        "stream": False,
    }
    if selected_repositories:
        groq_request["tools"] = [
            {
                "type": "mcp",
                "server_label": "github",
                "server_description": "Read-only tools for inspecting the signed-in user's selected GitHub repositories.",
                "server_url": GITHUB_MCP_URL,
                "headers": {
                    "Authorization": f"Bearer {payload.github_access_token}",
                    "X-MCP-Readonly": "true",
                },
                "require_approval": "never",
            }
        ]

    try:
        async with httpx.AsyncClient(timeout=85.0) as client:
            response = await client.post(
                GROQ_API_URL,
                headers={"Authorization": f"Bearer {groq_api_key}"},
                json=groq_request,
            )
    except httpx.TimeoutException as error:
        raise HTTPException(status_code=504, detail="AI Analysis took too long. Please retry.") from error
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Could not reach Groq. Please retry.") from error

    if response.status_code == 401:
        raise HTTPException(status_code=503, detail="Groq rejected the API key. Check GROQ_API_KEY on the Python service.")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Groq is rate-limiting requests. Please wait and retry.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail="Groq or GitHub MCP could not complete the request. Check the service configuration and GitHub permissions.")

    answer = response_text(response.json())
    if not answer:
        raise HTTPException(status_code=502, detail="The AI returned an empty response. Please retry.")

    return {
        "answer": answer,
        "githubAvailable": bool(selected_repositories),
        "selectedRepositories": selected_repositories,
    }

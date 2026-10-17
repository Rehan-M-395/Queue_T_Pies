# Queue_T_Pies Python AI service

This FastAPI service calls Groq's Responses API for AI chat and resume skill extraction. GitHub analysis
uses bounded source excerpts fetched directly from public GitHub URLs at a specific commit; it does not
call GitHub MCP and never sends a GitHub access token to the AI service. The Node API remains the
authenticated gateway: it verifies Queue_T_Pies sessions and forwards the selected public repositories.
FastAPI validates the same signed session before using the supplied user context.

## Local setup

From this folder, create and activate a virtual environment, then install requirements:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Set `GROQ_API_KEY` and the same `JWT_SECRET` used by `backend/.env` in `python-backend/.env`.
For local development, `main.py` also loads `backend/.env` as a fallback. Keep both files out of
source control. Install the updated requirements to add PDF/DOCX text extraction dependencies.

Start FastAPI in one terminal:

```powershell
python -m uvicorn main:app --host localhost --port 8001 --app-dir .
```

Set `PYTHON_AGENT_URL=http://localhost:8001` in `backend/.env`, then start the existing Node API
and Vite frontend as usual. The frontend calls Node only; it never receives Groq or GitHub tokens.

## Deployment

Deploy this as a private Python web service alongside the Node API:

- Root directory: `python-backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Python service environment: `GROQ_API_KEY`, and the same `JWT_SECRET` as the Node API
- Node service environment: `PYTHON_AGENT_URL` set to the Python service's private URL

Never expose secrets in frontend environment variables or commit them.

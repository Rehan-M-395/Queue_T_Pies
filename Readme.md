
# SkillBit AI — AI Career Coach

SkillBit AI is an AI-powered career coaching platform that helps users understand their skills, explore job opportunities, and evaluate how well their projects demonstrate the skills required for a role.

The platform combines resume analysis, job discovery, GitHub portfolio assessment, and an AI career assistant in one place.

## Features

- **Resume management:** Upload, view, download, and delete PDF or DOCX resumes.
- **Resume skill extraction:** Use AI to identify skills from resume text and display supporting evidence.
- **Job discovery:** Browse and filter job and internship listings. The current frontend includes preview listings; the backend also provides an IndianAPI integration.
- **Resume-to-job matching:** Compare a job’s listed skills with skills extracted from a selected resume.
- **GitHub integration:** Connect a GitHub account, select repositories, and use project context in career-related analysis.
- **Portfolio assessment:** Evaluate whether selected repositories demonstrate skills required by a job, using inspected code as evidence.
- **AI career assistant:** Ask career questions with resume and GitHub context.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, React Router |
| Backend API | Node.js, Express |
| AI service | Python, FastAPI, Groq |
| Database | PostgreSQL |
| File storage | Supabase Storage |
| Integrations | GitHub API, IndianAPI |

## Architecture

```text
React + Vite frontend
        |
        | HTTP API
        v
Node.js + Express backend
        |
        +---- PostgreSQL
        +---- Supabase Storage
        +---- GitHub API
        +---- IndianAPI
        |
        v
Python + FastAPI AI service
        |
        +---- Groq
        +---- Resume analysis
        +---- GitHub portfolio assessment
```

The frontend communicates with the Express API. The Node backend handles authentication, database operations, file storage, and external integrations. It calls the Python service for AI-powered analysis.

## Repository Structure

```text
Queue_T_Pies/
├── backend/                  # Express API
├── frontend/
│   └── vite-project/         # React + Vite application
├── python-backend/           # FastAPI AI service
├── Dummy/                    # Preview job listings
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm
- Python 3
- PostgreSQL
- A Supabase project for resume storage
- API credentials for the services you want to use

### 1. Clone the repository

```bash
git clone https://github.com/Rehan-M-395/Queue_T_Pies.git
cd Queue_T_Pies
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file using the backend's example configuration, if available. Add the required database, authentication, storage, GitHub, job-provider, and AI-service settings.

Start the backend using the script defined in `backend/package.json`.

### 3. Configure the Python AI service

```bash
cd ../python-backend
python -m venv .venv
```

Activate the virtual environment:

**Windows PowerShell**
```powershell
.venv\Scripts\Activate.ps1
```

**macOS / Linux**
```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure the service's environment variables and start FastAPI using the command specified by the project configuration.

### 4. Configure the frontend

```bash
cd ../frontend/vite-project
npm install
npm run dev
```

Open the local URL printed by Vite in your terminal.

> Run the backend and AI service alongside the frontend. Configure the frontend API proxy and backend service URL to match your local ports.

## Environment Configuration

The application uses environment variables for credentials and service URLs. Configure the variables required by each service in its local `.env` file.

Typical configuration includes:

- PostgreSQL connection string
- Session or JWT secret
- Frontend origin
- Supabase project URL and storage credentials
- GitHub OAuth application credentials
- GitHub token encryption key and webhook secret, if using those features
- IndianAPI key for live job data
- Groq API key
- Python AI service URL

Never commit `.env` files or API credentials to version control.

## Current Status

The repository contains the frontend, Express API, and Python AI service. Resume analysis and GitHub portfolio assessment are implemented in the codebase.

The current job-search page uses local preview listings. The backend includes an IndianAPI job-listing endpoint, but the frontend still needs to be connected to that endpoint for the job page to display live listings.

GitHub webhook events can be verified and queued for refresh, but a background worker is still needed to process those queued refresh requests.

## Security Notes

- Keep API keys and OAuth secrets on the server.
- Use HTTPS in production.
- Configure secure cookie settings and trusted frontend origins.
- Keep resume files private and authorize access through the backend.
- Do not commit credentials or private user data to the repository.

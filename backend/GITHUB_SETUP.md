# GitHub integration setup

## Backend environment

Set these variables in `backend/.env` for local development and in the Render service environment for production. Keep the client secret, webhook secret, and encryption key out of the frontend and source control.

```dotenv
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=https://YOUR_BACKEND_HOST/api/github/callback
GITHUB_TOKEN_ENCRYPTION_KEY=
GITHUB_WEBHOOK_SECRET=
```

Generate a fresh 32-byte encryption key and keep a protected backup; changing it makes previously stored GitHub credentials unreadable:

```sh
openssl rand -base64 32
```

Paste the generated value into `GITHUB_TOKEN_ENCRYPTION_KEY`. The server also accepts exactly 64 hexadecimal characters. Do not use the GitHub client secret or JWT secret as the encryption key.

## GitHub App settings

1. Set the App callback URL to the exact value of `GITHUB_CALLBACK_URL` (for example, `https://YOUR_BACKEND_HOST/api/github/callback`).
2. Enable user authorization / OAuth for the GitHub App and set its client ID and client secret in the backend environment.
3. Grant **Metadata: read-only** and **Contents: read-only** if selected repositories will later be inspected for skills. The user and organization must authorize the app for the repositories they want to share; organization policy may also require approval.
4. Set the webhook URL to `https://YOUR_BACKEND_HOST/api/github/webhook`, set a random webhook secret, and put the same value in `GITHUB_WEBHOOK_SECRET`. Subscribe to **Push** events and enable the webhook.
5. Ensure `FRONTEND_ORIGIN` is the exact browser origin of the deployed frontend so OAuth returns to `/dashboard`.

## Database and verification

Run `npm run db:migrate` from the `backend` directory after deploying the code. The migration runner tracks applied migrations in `public.schema_migrations` and is safe to rerun. The webhook currently queues refresh requests in `public.github_analysis_refreshes`; an analysis worker must consume that queue before push events trigger actual repository analysis.

Sign in to Queue_T_Pies, open **GitHub Analysis**, connect the GitHub account, and select repositories. The app stores repository selection against the authenticated Queue_T_Pies user. It never returns GitHub tokens to the browser. GitHub App permissions still determine which repositories GitHub returns.

The integration is not operational until the environment variables, GitHub App settings, and migration are configured on the deployed backend.

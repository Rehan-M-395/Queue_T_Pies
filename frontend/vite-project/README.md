# Queue T Pies frontend

## Deploy to Vercel

Create a Vercel project for this repository and set **Root Directory** to
`frontend/vite-project`. Use these build settings:

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Set the `VITE_API_URL` environment variable for the Production environment to
the public URL of the deployed API, for example
`https://queue-t-pies.onrender.com`. Do not use `localhost` for a deployed
frontend. The frontend currently defaults to that Render API URL when the
variable is not set. Set the variable for Preview deployments too if those
deployments should use the same API.

`vercel.json` routes frontend paths to `index.html` so client-side routes also
work when opened directly or refreshed. The API must allow requests from the
deployed frontend origin, including credentialed requests used for sign-in.

## Run locally

Install dependencies and start the Vite development server:

```sh
npm install
npm run dev
```

For local development, leave `VITE_API_URL` empty to use the `/api` proxy in
`vite.config.js`. The ignored `.env` file is local-only and is not used by
Vercel.

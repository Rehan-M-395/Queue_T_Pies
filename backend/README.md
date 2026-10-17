# Queue_T_pies API

## Local setup

1. Add your Neon connection string to `DATABASE_URL` in `.env`. Use the pooled connection string from Neon and keep `sslmode=require` in the URL.
2. Set `JWT_SECRET` to a long random value of at least 32 characters.
3. Add your Supabase project URL as `SUPABASE_URL` and its **server-side secret key** as `SUPABASE_SECRET_KEY`. `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_JWKS_URL` can also be recorded there, but resume storage uses only the secret key. Never add the secret key to a frontend environment variable or commit it.
4. Confirm `USERS_TABLE` matches your table. It defaults to `public.users`.
5. Run `npm run db:migrate` from this folder to apply the resume metadata and skill extraction migrations.
6. Run `npm run dev` from this folder. When the Supabase values are set, the API creates or ensures a private `resumes` bucket at startup. The API listens on port 3000 by default.
7. In another terminal, run `npm run dev` from `frontend/vite-project`.

The user table must have `id`, `name`, `email`, `password_hash`, `role`, `created_at`, and `updated_at` columns. `id` should accept UUID values, and email should have a unique constraint. New account passwords are stored as bcrypt hashes. Admin/HR roles must be provisioned by an administrator; public signup only creates the `user` role.

The JWT is stored in an HttpOnly cookie. The API supports:

- `POST /api/auth/signup`
- `POST /api/auth/login` (send `portal: "admin"` for Admin/HR sign-in)
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/health`
- `GET /api/jobs` (authenticated; accepts local `q`, `location`, `experience`, listing `type`, and `page` filters)

Job listings are fetched from IndianAPI using the server-only `INDIANAPI_API_KEY` (`X-Api-Key` header), cached in memory for five minutes, and locally filtered and paginated. The provider response supports a `limit` query parameter but does not return pagination metadata; the backend requests up to 100 records per cache refresh. The original description, skills/education text, responsibilities, and application URL are preserved in the normalized response for display and future AI matching.

The sample row has a plaintext value in `password_hash`. On its first successful sign-in, the API upgrades that value to a bcrypt hash. Replace the sample password with a strong one after setup.

Resume files are limited to 10 MB and PDF/DOCX, verified by extension, MIME type, and file signature. The API stores objects under a per-user path, keeps metadata in `public.resumes`, and issues short-lived signed URLs only after verifying ownership. `POST /api/resumes/:id/analyze` retrieves that user's private file, sends it to the authenticated Python AI service for text extraction and Groq skill extraction, and persists structured skills on the resume row. The relevant endpoints are `POST /api/resumes`, `GET /api/resumes`, `POST /api/resumes/:id/analyze`, `GET /api/resumes/:id/view`, `GET /api/resumes/:id/download`, and `DELETE /api/resumes/:id`.

Resume text is sent server-to-server to Groq for analysis; the frontend never receives the Groq key. Scanned PDFs without a text layer are reported as unreadable (OCR is not included). Install the updated `python-backend/requirements.txt` before starting the Python service.

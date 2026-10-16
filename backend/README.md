# Queue_T_pies API

## Local setup

1. Add your Neon connection string to `DATABASE_URL` in `.env`. Use the pooled connection string from Neon and keep `sslmode=require` in the URL.
2. Set `JWT_SECRET` to a long random value of at least 32 characters.
3. Confirm `USERS_TABLE` matches your table. It defaults to `public.users`.
4. Run `npm run dev` from this folder. The API listens on port 4000 by default.
5. In another terminal, run `npm run dev` from `frontend/vite-project`.

The user table must have `id`, `name`, `email`, `password_hash`, `role`, `created_at`, and `updated_at` columns. `id` should accept UUID values, and email should have a unique constraint. New account passwords are stored as bcrypt hashes. Admin/HR roles must be provisioned by an administrator; public signup only creates the `user` role.

The JWT is stored in an HttpOnly cookie. The API supports:

- `POST /api/auth/signup`
- `POST /api/auth/login` (send `portal: "admin"` for Admin/HR sign-in)
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/health`

The sample row has a plaintext value in `password_hash`. On its first successful sign-in, the API upgrades that value to a bcrypt hash. Replace the sample password with a strong one after setup.

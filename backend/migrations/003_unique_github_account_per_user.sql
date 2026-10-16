-- A GitHub identity can be linked to only one Queue_T_Pies account.
-- Check and resolve existing duplicates before applying this migration.
CREATE UNIQUE INDEX IF NOT EXISTS github_connections_github_user_id_unique_idx
  ON public.github_connections (github_user_id);

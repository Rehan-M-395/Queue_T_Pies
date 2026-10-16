CREATE TABLE IF NOT EXISTS public.github_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_oauth_states_expiry_idx ON public.github_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS public.github_connections (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  github_user_id BIGINT NOT NULL,
  github_login TEXT NOT NULL,
  token_ciphertext BYTEA NOT NULL,
  token_iv BYTEA NOT NULL,
  token_auth_tag BYTEA NOT NULL,
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_connections_github_user_id_idx ON public.github_connections (github_user_id);

CREATE TABLE IF NOT EXISTS public.github_repositories (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  repository_id BIGINT NOT NULL,
  full_name TEXT NOT NULL,
  private BOOLEAN NOT NULL DEFAULT FALSE,
  html_url TEXT NOT NULL,
  description TEXT,
  language TEXT,
  default_branch TEXT,
  pushed_at TIMESTAMPTZ,
  selected BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, repository_id)
);

CREATE INDEX IF NOT EXISTS github_repositories_selected_idx ON public.github_repositories (user_id, selected);

CREATE TABLE IF NOT EXISTS public.github_analysis_refreshes (
  delivery_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  repository_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (delivery_id, user_id, repository_id),
  FOREIGN KEY (user_id, repository_id) REFERENCES public.github_repositories(user_id, repository_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS github_analysis_refreshes_pending_idx ON public.github_analysis_refreshes (status, requested_at);

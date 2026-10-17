CREATE TABLE IF NOT EXISTS public.github_portfolio_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_snapshot JSONB NOT NULL,
  assessment JSONB NOT NULL,
  analysis_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (analysis_status IN ('complete', 'partial')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_portfolio_assessments_user_job_idx
  ON public.github_portfolio_assessments (user_id, job_id, created_at DESC);

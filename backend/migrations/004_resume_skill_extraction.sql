ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS extracted_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skills_analysis_status TEXT NOT NULL DEFAULT 'not_analyzed'
    CHECK (skills_analysis_status IN ('not_analyzed', 'analyzing', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS skills_analyzed_at TIMESTAMPTZ;

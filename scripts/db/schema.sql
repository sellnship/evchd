-- ─────────────────────────────────────────────────────────────────────────────
-- Neon Postgres schema for the DB-backed Blog + admin panel.
-- Idempotent (IF NOT EXISTS everywhere) — safe to re-run any time via:
--   DATABASE_URL=... node scripts/db/migrate.mjs
--
-- Source-of-truth split:
--   guides/news/compare/glossary → markdown in git (unchanged, PR-gated engine)
--   blog                         → rows in `articles` here (admin + engine DB mode)
-- ─────────────────────────────────────────────────────────────────────────────

-- Blog articles. One row per (slug, lang); EN and HI share a slug — that pairing
-- is the translation link, mirroring the site's hi/<slug> entry-id convention.
CREATE TABLE IF NOT EXISTS articles (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           text NOT NULL,
  lang           text NOT NULL DEFAULT 'en' CHECK (lang IN ('en', 'hi')),
  title          text NOT NULL,
  description    text NOT NULL DEFAULT '',
  category       text NOT NULL DEFAULT '',
  hero_image     text NOT NULL DEFAULT '',   -- absolute URL (Vercel Blob) or /images/... path
  author         text NOT NULL DEFAULT 'rajinder-singh',
  reviewed_by    text NOT NULL DEFAULT 'rajinder-singh',
  date_published timestamptz,                -- set on first publish
  date_modified  timestamptz,
  tags           text[] NOT NULL DEFAULT '{}',
  body_md        text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, lang)
);

-- AI topic queue for the blog — the DB equivalent of scripts/queue.json.
-- The engine's success status here is 'drafted' (NOT 'published'): publishing
-- is a human act on the articles row, from the admin.
CREATE TABLE IF NOT EXISTS topics (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         text NOT NULL,
  lang         text NOT NULL CHECK (lang IN ('en', 'hi')),
  title        text NOT NULL,
  category     text NOT NULL DEFAULT '',
  image_prompt text NOT NULL DEFAULT '',
  angle        text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'drafted', 'skipped-dup',
                                 'killed-commodity', 'halted-factcheck', 'failed')),
  outcome      jsonb NOT NULL DEFAULT '{}',  -- dedupMatch/dedupScore/killReason/factCheckIssues
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, lang)
);

-- Admin dashboard activity feed.
CREATE TABLE IF NOT EXISTS activity_log (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at     timestamptz NOT NULL DEFAULT now(),
  actor  text NOT NULL DEFAULT 'admin',      -- 'admin' | 'engine'
  action text NOT NULL,                      -- e.g. 'article.publish', 'topic.create'
  detail jsonb NOT NULL DEFAULT '{}'
);

-- Editable non-secret settings (deploy_hook_url etc.). Secrets stay in env.
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_status_idx ON articles (status, date_published DESC);
CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at DESC);

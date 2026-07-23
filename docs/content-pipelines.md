# Content Pipelines — How Articles Get Written & Published

> evchandigarh.in has **two ways to produce an article** — the original
> **Engine pipeline** (GitHub Actions + cron, git-based) and the newer
> **Admin pipeline** (admin panel + Neon database). This document explains
> both, then compares them on the thing that matters most: **how well the
> article is verified before it goes live.**

---

## 1. The Engine pipeline (original) — GitHub Actions + cron

**Where content lives:** markdown files in git (`src/content/guides`, `news`, `compare`, `glossary`)
**How it publishes:** a Pull Request you merge → push to `main` → Vercel rebuilds

### Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  scripts/queue.json  ←  human adds topics (slug, title EN/HI,       │
│                         category, angle, imagePrompt)               │
└────────────────────────────────┬────────────────────────────────────┘
                                 │  every Monday 04:00 UTC (cron)
                                 │  or manual "Run workflow"
                                 ▼
              .github/workflows/publish.yml  (GitHub Actions)
                                 │  runs scripts/generate.mjs
                                 │  twice: EN pass, then HI pass
                                 ▼
      ┌──────────────── THE GATE PIPELINE (per language) ────────────┐
      │ 1. DEDUP        Jaccard-similarity vs every existing article │
      │                 (blocks near-duplicates, threshold 0.5)      │
      │ 2. DRAFT        Claude Sonnet writes the article natively    │
      │                 (Hindi is drafted in Hindi, not translated)  │
      │                 grounded in src/data/local-facts.json +      │
      │                 models.json — brand-neutral prompt rules     │
      │ 3. ORIGINALITY  Claude Haiku "kill-switch": generic /        │
      │                 commodity drafts are killed, not published   │
      │ 4. FACT-CHECK   every claim checked against the data layer;  │
      │                 a critical contradiction HALTS the topic     │
      │ 5. HERO IMAGE   fal.ai Imagen 4, hard vehicle rules (seated  │
      │                 step-through e-moped, never a kick scooter), │
      │                 1200×675 WebP + logo watermark               │
      │ 6. WRITE        markdown + frontmatter → src/content/...     │
      │ 7. AUDIT        outcome recorded in queue.json               │
      └──────────────────────────────┬───────────────────────────────┘
                                     ▼
                 Opens a PULL REQUEST ("Review & publish: <slug>")
                                     │
                     👤 HUMAN REVIEW — read the diff, check the
                        hero image checklist, then MERGE
                                     │
                                     ▼
                  merge → main → Vercel auto-deploys → LIVE
```

### Key properties

- **Four automated quality gates** run before a human ever sees the draft.
- Facts are grounded in a curated data layer (`local-facts.json`) — the
  fact-check gate halts on any genuine contradiction.
- **Nothing ever reaches `main` without a human merging the PR.** The PR diff
  is the review surface; the queue update is the audit trail.
- Cadence is deliberate: one topic (EN + HI) per weekly cron run.
- Secrets (`ANTHROPIC_API_KEY`, `FAL_KEY`) live in GitHub repository secrets.

---

## 2. The Admin pipeline (new) — Admin panel + Neon DB

**Where content lives:** rows in Neon Postgres (`articles` table)
**How it publishes:** Publish button → status flip in DB → Vercel Deploy Hook → site rebuilds from DB

### Flow

```
        Admin panel (admin/ — separate Vercel project, Astro SSR)
┌─────────────────────────────────────────────────────────────────────┐
│ 1. TOPIC      💡 Suggest Topics: Google Trends (India) + the chosen │
│               LLM (OpenAI / Anthropic / Groq / Gemini / xAI keys    │
│               stored in DB via Settings) propose 5 topics, deduped  │
│               against existing content → "Use This" fills the form  │
│               → ＋ Queue Topic (Neon `topics` table, EN + HI pair)  │
│                                                                     │
│ 2. ARTICLE    two buttons per pending topic:                        │
│    ⚡ Draft with AI   the selected LLM writes the article directly  │
│                       in the admin (~30 s) → saved as status=draft  │
│                       ⚠ NO automated gates — prompt rules only      │
│    ▶ Engine           dispatches publish-blog.yml → the FULL gate   │
│                       pipeline (dedup/originality/fact-check/hero)  │
│                       runs in GitHub Actions with OUTPUT_MODE=db →  │
│                       lands as status=draft in Neon (no PR, no git) │
│                                                                     │
│ 3. IMAGES     in the editor: 🎨 Generate Hero (prompt pre-filled    │
│               from the article, editable; GPT Image 1 default,      │
│               Nano Banana / Imagen 4 / DALL·E 3 selectable) +       │
│               🖼 body images inserted at the cursor. Branded        │
│               1200×675 WebP on Vercel Blob.                         │
│                                                                     │
│ 4. REVIEW     👤 human edits text + images in the editor            │
│                                                                     │
│ 5. PUBLISH    🚀 Save & Publish → status=published → deploy hook    │
│               → static site rebuilds (~1–2 min) reading from Neon   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key properties

- **Fast**: topic → published article in minutes, all in one UI.
- Any LLM provider, chosen per generation via dropdown; image models likewise.
- The blog section of the site (`/blog`, `/hi/blog`) builds **from the DB** at
  build time — git is never touched for blog content.
- The `⚡ Draft with AI` path has **no automated verification** — the
  drafting prompt carries the editorial rules (brand-neutral, no invented
  numbers, Tricity-local), but nothing checks the output. The human reviewer
  is the only gate.
- The `▶ Engine` path is the **hybrid**: same four gates as the original
  pipeline, but the result lands in the admin as a draft instead of a PR.

---

## 3. Side-by-side comparison

| | **Engine (cron + PR)** | **Admin ⚡ Draft with AI** | **Admin ▶ Engine (hybrid)** |
|---|---|---|---|
| Dedup gate | ✅ automated | ⚠ only at topic-suggestion time | ✅ automated |
| Brand-neutrality | ✅ prompt + critique gate | ⚠ prompt only | ✅ prompt + critique gate |
| Originality kill-switch | ✅ generic drafts killed | ❌ none | ✅ |
| **Fact-check vs data layer** | ✅ halts on contradiction | ❌ none | ✅ halts on contradiction |
| Hero vehicle rules | ✅ enforced in pipeline | ✅ enforced in prompt | ✅ enforced in pipeline |
| Human review surface | PR diff on GitHub | Admin editor (rendered fields) | Admin editor |
| Human review is… | mandatory (merge) | mandatory (publish) | mandatory (publish) |
| Speed (topic → live) | ~1 week cadence (or manual run) | **minutes** | ~10 min (Actions run) |
| LLM choice | fixed (Claude Sonnet + Haiku) | any configured provider | fixed (Claude Sonnet + Haiku) |
| Image models | fal.ai Imagen 4 | OpenAI / Gemini, selectable | fal.ai Imagen 4 |
| Content store | git (markdown) | Neon DB | Neon DB |
| Publish action | merge PR | Publish button + deploy hook | Publish button + deploy hook |
| Audit trail | queue.json + git history | `topics.outcome` + activity_log | `topics.outcome` + activity_log |
| Needs GitHub PAT | no (cron) | no | yes (workflow dispatch) |

---

## 4. Which is preferred — verdict on verification

Ranked by **how thoroughly the article is verified before posting**:

### 🥇 1. Admin ▶ Engine (hybrid) — *recommended default*
All four automated gates (dedup, brand-neutrality critique, originality
kill-switch, **fact-check against the curated data layer**) **plus** a human
review in the comfortable admin editor before Publish. Same rigor as the
original pipeline with a much better review surface than a raw PR diff.
Use it for anything factual: rules, tariffs, costs, buying guides.

### 🥈 2. Engine (cron + PR) — *equal rigor, slower surface*
Identical gates, human gate is the PR merge. Still the right choice for the
four markdown sections (guides/news/compare) and for fully hands-off weekly
cadence. Reviewing a rendered article in the admin is easier than reading
a markdown diff, which is the only reason this ranks second.

### 🥉 3. Admin ⚡ Draft with AI — *fastest, human-only verification*
Zero automated verification: the LLM's output goes straight to the draft you
review. Perfectly fine for opinion pieces, seasonal notes, event round-ups —
content where the risk of a factual error is low and speed matters. **Not
recommended for regulatory/pricing content** (licence rules, tariff numbers,
subsidy claims) unless you verify every figure yourself before publishing.

### Rule of thumb

> **If the article contains a number or a rule, run it through a gate
> (▶ Engine). If it's a story or an opinion, ⚡ Draft is fine — you are
> the fact-checker either way, because no article publishes without a
> human clicking Publish/Merge.**

---

## 5. File map (for maintainers)

| Piece | Path |
|---|---|
| Engine orchestrator (both modes) | `scripts/generate.mjs` |
| Gates: dedup / LLM calls / images | `scripts/lib/{dedup,claude,image}.mjs` |
| Engine DB mode (Neon access) | `scripts/lib/db.mjs` |
| Weekly cron workflow (PR path) | `.github/workflows/publish.yml` |
| Event news workflow (PR path) | `.github/workflows/publish-news.yml` |
| Hybrid workflow (DB path) | `.github/workflows/publish-blog.yml` |
| Topic queue (git path) | `scripts/queue.json` |
| Fact data layer | `src/data/local-facts.json`, `src/data/models.json` |
| DB schema (articles/topics/categories) | `scripts/db/schema.sql` |
| Admin app | `admin/` (own Vercel project, Root Directory = `admin`) |
| Admin AI: suggest / draft / images | `admin/src/pages/api/topics/{suggest,draft}.ts`, `admin/src/pages/api/blog/{genhero,genimage}.ts` |
| Multi-LLM client | `admin/src/lib/llm.ts` |
| Site's DB-backed blog loader | `src/lib/blog-loader.mjs` |
```

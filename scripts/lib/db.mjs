// scripts/lib/db.mjs
//
// Neon Postgres access for the engine's DB mode (OUTPUT_MODE=db) — the blog
// pipeline. Mirrors the queue.json contract: topics are picked by (slug, lang),
// outcomes are recorded on the topic row, and the drafted article is INSERTED
// as status='draft' for human review in the admin (publishing is a human act
// on the articles row — the engine never publishes).
//
// Uses the HTTP driver (no pooling) — right for short-lived CI runs.

import { neon } from "@neondatabase/serverless";

let _sql = null;
export function getSql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("[db] DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

/** Fetch the pending blog topic for exactly (slug, lang) — DB mode never scans
 *  "first pending" so it can't race the weekly file-mode cron. Returns a
 *  queue.json-shaped topic object, or null. */
export async function fetchPendingTopic({ slug, lang }) {
  const sql = getSql();
  const rows = await sql`
    SELECT slug, lang, title, category, image_prompt, angle
    FROM topics
    WHERE status = 'pending' AND slug = ${slug} AND lang = ${lang}
    LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    slug: r.slug,
    lang: r.lang,
    title: r.title,
    section: "blog",
    category: r.category,
    imagePrompt: r.image_prompt,
    angle: r.angle,
  };
}

/** Record the run outcome on the topic row (status + processed_at + merged
 *  jsonb extras) — the DB twin of generate.mjs recordOutcome(). */
export async function recordTopicOutcome(topic, status, extra = {}) {
  const sql = getSql();
  await sql`
    UPDATE topics
    SET status = ${status},
        processed_at = now(),
        outcome = outcome || ${JSON.stringify(extra)}::jsonb
    WHERE slug = ${topic.slug} AND lang = ${topic.lang || "en"}`;
}

/** Insert the drafted article. ON CONFLICT overwrites a previous draft of the
 *  same (slug, lang) — a re-run replaces its own unpublished draft; collisions
 *  with *published* content are already blocked by the dedup gate. */
export async function insertDraftArticle({ topic, body, heroImage, description, tags }) {
  const sql = getSql();
  await sql`
    INSERT INTO articles (slug, lang, title, description, category, hero_image,
                          tags, body_md, status, source)
    VALUES (${topic.slug}, ${topic.lang || "en"}, ${topic.title}, ${description},
            ${topic.category}, ${heroImage}, ${tags}, ${body}, 'draft', 'ai')
    ON CONFLICT (slug, lang) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      hero_image = EXCLUDED.hero_image,
      tags = EXCLUDED.tags,
      body_md = EXCLUDED.body_md,
      source = 'ai',
      updated_at = now()`;
}

/** All blog articles (every status — a draft awaiting review should still block
 *  a near-duplicate topic) shaped for the dedup corpus. */
export async function fetchBlogCorpus() {
  const sql = getSql();
  const rows = await sql`SELECT slug, title, lang FROM articles`;
  return rows.map((r) => ({ slug: r.slug, title: r.title, lang: r.lang }));
}

/** Append to the admin dashboard's activity feed. */
export async function logActivity(action, detail = {}, actor = "engine") {
  const sql = getSql();
  await sql`
    INSERT INTO activity_log (actor, action, detail)
    VALUES (${actor}, ${action}, ${JSON.stringify(detail)}::jsonb)`;
}

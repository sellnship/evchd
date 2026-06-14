// scripts/generate.mjs
//
// The content engine orchestrator. A DETERMINISTIC pipeline, not an agent:
// fixed stages, each logged, one article per run. It pulls the next pending
// topic from scripts/queue.json, drafts it with the data layer, runs the
// originality and fact-check gates, generates a branded hero, writes the
// article, and records the outcome back into the queue (the audit trail).
//
//   ANTHROPIC_API_KEY=... FAL_KEY=... node scripts/generate.mjs
//
// Exit code is always 0 for an orderly outcome (published, no work, skipped,
// killed, or halted) so the CI job can commit the queue update; it is non-zero
// only on an unexpected failure. Committing + pushing is owned by the workflow,
// not this script, so the engine stays a pure, testable filesystem step.

import { promises as fs } from "node:fs";
import path from "node:path";
import { draft, critique, factCheck } from "./lib/claude.mjs";
import { isDuplicate } from "./lib/dedup.mjs";
import { generateHero } from "./lib/image.mjs";

const QUEUE_PATH = path.join("scripts", "queue.json");
const FACTS_PATH = path.join("src", "data", "local-facts.json");
const MODELS_PATH = path.join("src", "data", "models.json");
const CONTENT_ROOT = path.join("src", "content");
const AUTHOR = "rajinder-singh";

// Content sections that map to a collection directory under src/content.
const VALID_SECTIONS = new Set(["guides", "news", "compare", "glossary"]);

const log = (stage, msg) => console.log(`[engine] ${stage.padEnd(10)} | ${msg}`);

const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/** Read + parse the topic queue. */
async function readQueue() {
  return JSON.parse(await fs.readFile(QUEUE_PATH, "utf8"));
}

/** Persist the queue (the audit trail) with stable 2-space formatting. */
async function writeQueue(queue) {
  await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2) + "\n");
}

/** A queue entry is a real topic (not the leading _meta note) with a status. */
const isTopic = (e) => e && !e._isMeta && typeof e.status === "string";

/** Strip markdown to a plain-text description from the body's first paragraph. */
function deriveDescription(body) {
  const firstPara = body
    .replace(/^#.*$/gm, "") // drop any stray heading
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("[[") && !p.startsWith("-"));
  const plain = (firstPara || "")
    .replace(/\[\[.*?\]\]/g, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 158) return plain;
  return plain.slice(0, 155).replace(/\s+\S*$/, "") + "…";
}

/** YAML-safe scalar (quote + escape via JSON). */
const y = (s) => JSON.stringify(String(s ?? ""));

/** Build the article markdown: frontmatter + body, with [[CTA]] resolved. */
function buildArticle(topic, body, heroImage, description) {
  const date = today();
  const tags = [topic.category, "low-speed", "Tricity"].filter(Boolean);
  // ArticleLayout renders the CTABlock component for every article site-wide,
  // and content files are plain .md (no MDX), so a component can't be inlined
  // in the body. The [[CTA]] placeholder is therefore REMOVED here — the real
  // CTA is supplied by the layout. (See ArticleLayout.astro.)
  const cleanBody = body
    .replace(/\n*\[\[CTA\]\]\s*$/i, "")
    .replace(/^#\s.*$/m, "") // defensively drop a leading H1 if the model added one
    .trim();

  const frontmatter = [
    "---",
    `title: ${y(topic.title)}`,
    `description: ${y(description)}`,
    `category: ${y(topic.category)}`,
    `lang: ${y(topic.lang || "en")}`,
    `heroImage: ${y(heroImage)}`,
    `author: ${y(AUTHOR)}`,
    `reviewedBy: ${y(AUTHOR)}`,
    `datePublished: ${date}`,
    `dateModified: ${date}`,
    `tags: [${tags.map(y).join(", ")}]`,
    "draft: false",
    "---",
  ].join("\n");

  return `${frontmatter}\n\n${cleanBody}\n`;
}

/** Record the outcome on the matching topic and persist the queue. */
async function recordOutcome(queue, slug, status, extra = {}) {
  const entry = queue.find((e) => isTopic(e) && e.slug === slug);
  if (entry) {
    entry.status = status;
    entry.processedAt = new Date().toISOString();
    Object.assign(entry, extra);
  }
  await writeQueue(queue);
}

async function main() {
  // Preconditions — fail loudly if the engine can't run.
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("✗ ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }
  if (!process.env.FAL_KEY) {
    console.error("✗ FAL_KEY is not set (needed for the hero image).");
    process.exit(1);
  }

  const queue = await readQueue();
  const facts = await fs.readFile(FACTS_PATH, "utf8");
  const models = await fs.readFile(MODELS_PATH, "utf8");

  // STAGE 1 — pull the next pending topic. TOPIC_LANG (optional) targets a
  // specific language's first pending topic; unset = first pending overall.
  const wantLang = process.env.TOPIC_LANG;
  const topic = queue.find(
    (e) => isTopic(e) && e.status === "pending" && (!wantLang || (e.lang || "en") === wantLang),
  );
  if (!topic) {
    log("queue", wantLang ? `no pending "${wantLang}" topics — nothing to do.` : "no pending topics — nothing to do. Exiting cleanly.");
    return;
  }
  if (!VALID_SECTIONS.has(topic.section)) {
    log("queue", `topic "${topic.slug}" has invalid section "${topic.section}" — halting.`);
    await recordOutcome(queue, topic.slug, "halted-invalid-section");
    return;
  }
  log("queue", `picked "${topic.slug}" (${topic.section}/${topic.category}, lang=${topic.lang || "en"})`);

  // STAGE 2 — dedup gate.
  const dup = await isDuplicate(topic);
  if (dup.duplicate) {
    log("dedup", `DUPLICATE of "${dup.match}" (score ${dup.score}) — skipping, not drafting.`);
    await recordOutcome(queue, topic.slug, "skipped-dup", { dedupMatch: dup.match, dedupScore: dup.score });
    return;
  }
  log("dedup", `clear (closest existing: "${dup.match}" @ ${dup.score}).`);

  // STAGE 3 — draft.
  log("draft", `drafting via Sonnet…`);
  const body = await draft({ topic, facts, models });
  log("draft", `drafted ${body.length} chars.`);

  // STAGE 4 — originality kill-switch.
  const verdict = await critique(body);
  if (verdict.isCommodity) {
    log("critique", `KILLED as commodity: ${verdict.reason} — not writing.`);
    await recordOutcome(queue, topic.slug, "killed-commodity", { killReason: verdict.reason });
    return;
  }
  log("critique", `passed originality (${verdict.reason}).`);

  // STAGE 5 — fact-check against the data layer. Only `critical` issues
  // (factual contradictions, fabricated figures, value-split errors) halt;
  // `warning` issues are logged for the audit trail but never block.
  const { issues } = await factCheck(body, { facts, models });
  const critical = issues.filter((i) => String(i.severity).toLowerCase() === "critical");
  if (issues.length) {
    log("factcheck", `${issues.length} issue(s): ${critical.length} critical, ${issues.length - critical.length} warning.`);
    for (const i of issues) log("factcheck", `  [${i.severity}] ${i.problem}`);
  } else {
    log("factcheck", "no issues — all claims trace to the data layer.");
  }
  if (critical.length) {
    log("factcheck", `HALTING "${topic.slug}" — ${critical.length} critical issue(s), not writing.`);
    await recordOutcome(queue, topic.slug, "halted-factcheck", { factCheckIssues: issues });
    return;
  }

  // STAGE 6 — branded hero image (1200x675, logo watermark).
  // The editorial style + vehicle/charging rules live in scripts/lib/image.mjs
  // (PROMPT_SUFFIX), so we pass only the per-topic scene here.
  log("image", `generating hero via fal…`);
  const heroImage = await generateHero({ prompt: topic.imagePrompt, slug: topic.slug });
  log("image", `hero → ${heroImage}`);

  // STAGE 7 — wrap: write markdown with frontmatter into the right section
  // (Hindi articles go under <section>/hi/ so they route under /hi/).
  const description = deriveDescription(body);
  const article = buildArticle(topic, body, heroImage, description);
  const outDir =
    topic.lang === "hi"
      ? path.join(CONTENT_ROOT, topic.section, "hi")
      : path.join(CONTENT_ROOT, topic.section);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${topic.slug}.md`);
  await fs.writeFile(outPath, article);
  log("write", `wrote ${outPath} (${article.length} chars).`);

  // STAGE 8 — mark published in the queue (git commit/push is the workflow's job).
  await recordOutcome(queue, topic.slug, "published", {
    publishedPath: outPath,
    factCheckIssues: issues, // [] or minor-only — kept for the audit trail
  });
  log("done", `published "${topic.slug}". Queue updated.`);
}

main().catch((err) => {
  console.error("\n✗ Engine run failed:\n", err);
  process.exit(1);
});

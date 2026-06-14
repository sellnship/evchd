// scripts/lib/dedup.mjs
//
// isDuplicate(topic) — guards against the near-duplicate-page pattern that
// triggers search penalties. Before drafting, compare the queued topic's
// slug / title / angle against every already-published article and block if
// it's too close to one that exists.
//
// "Embedding" here is a deterministic, dependency-free token model: we reduce
// each title/angle to a normalised set of meaningful word tokens and score
// overlap with Jaccard + containment similarity. A real embedding API would be
// stronger, but this is offline, free, and good enough to catch the obvious
// "you already wrote this" cases — which is the whole point of the gate.

import { promises as fs } from "node:fs";
import path from "node:path";

const CONTENT_ROOT = path.join("src", "content");

// Block when Jaccard similarity to any existing same-language article meets/exceeds this.
const SIMILARITY_THRESHOLD = 0.5;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "your",
  "you", "is", "are", "do", "does", "how", "what", "why", "it", "at", "by",
  "from", "this", "that", "as", "be", "can", "vs", "versus", "into", "out",
  "tricity", "chandigarh", "mohali", "panchkula", "ev", "evs", "electric",
  "scooter", "scooters", "low", "speed", "low-speed",
]);

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/** Symmetric Jaccard similarity. (Containment was too aggressive: a longer topic
 *  that merely mentions all of a short title's words — e.g. a battery-replacement
 *  guide referencing "lead-acid vs lithium" — scored as a full duplicate.) */
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

/** Recursively collect every published article's slug + title + lang from src/content. */
async function loadExisting() {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.name.endsWith(".md") && !e.name.startsWith("_")) {
        const slug = e.name.replace(/\.md$/, "");
        const text = await fs.readFile(full, "utf8");
        const m = text.match(/^title:\s*["']?(.+?)["']?\s*$/m);
        // A file under a /hi/ segment (or with lang: hi frontmatter) is Hindi.
        const lm = text.match(/^lang:\s*["']?(\w+)["']?\s*$/m);
        const lang = lm ? lm[1] : /(^|\/)hi\//.test(full) ? "hi" : "en";
        out.push({ slug, title: m ? m[1] : slug, lang });
      }
    }
  }
  await walk(CONTENT_ROOT);
  return out;
}

/**
 * @param {{ slug: string, title: string, angle?: string, lang?: string }} topic
 * @returns {Promise<{ duplicate: boolean, match?: string, score?: number }>}
 */
export async function isDuplicate(topic) {
  if (!topic?.slug) throw new Error("[dedup] topic requires a slug");
  const lang = topic.lang ?? "en";
  // Compare only within the same language — a Hindi article isn't a duplicate
  // of its English counterpart.
  const existing = (await loadExisting()).filter((a) => a.lang === lang);
  // Include the slug in the token set: slugs are roman-script and descriptive,
  // so they survive Hindi's Devanagari stripping and keep distinct topics apart
  // (a Hindi title alone can collapse to a single shared token like "battery").
  const topicTokens = tokenize(`${topic.slug} ${topic.title} ${topic.angle ?? ""}`);

  let best = { score: 0, match: null };
  for (const art of existing) {
    if (art.slug === topic.slug) {
      return { duplicate: true, match: art.slug, score: 1 };
    }
    const score = similarity(topicTokens, tokenize(`${art.slug} ${art.title}`));
    if (score > best.score) best = { score, match: art.slug };
  }

  return {
    duplicate: best.score >= SIMILARITY_THRESHOLD,
    match: best.match,
    score: Number(best.score.toFixed(2)),
  };
}

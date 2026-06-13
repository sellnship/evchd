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

// Block when similarity to any existing article meets/exceeds this.
const SIMILARITY_THRESHOLD = 0.62;

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

/** Jaccard similarity blended with containment (so a short topic fully covered by a longer title still scores high). */
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  const jaccard = inter / union;
  const containment = inter / Math.min(a.size, b.size);
  return Math.max(jaccard, containment * 0.9);
}

/** Recursively collect every published article's slug + title from src/content. */
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
        out.push({ slug, title: m ? m[1] : slug });
      }
    }
  }
  await walk(CONTENT_ROOT);
  return out;
}

/**
 * @param {{ slug: string, title: string, angle?: string }} topic
 * @returns {Promise<{ duplicate: boolean, match?: string, score?: number }>}
 */
export async function isDuplicate(topic) {
  if (!topic?.slug) throw new Error("[dedup] topic requires a slug");
  const existing = await loadExisting();
  const topicTokens = tokenize(`${topic.title} ${topic.angle ?? ""}`);

  let best = { score: 0, match: null };
  for (const art of existing) {
    if (art.slug === topic.slug) {
      return { duplicate: true, match: art.slug, score: 1 };
    }
    const score = similarity(topicTokens, tokenize(art.title));
    if (score > best.score) best = { score, match: art.slug };
  }

  return {
    duplicate: best.score >= SIMILARITY_THRESHOLD,
    match: best.match,
    score: Number(best.score.toFixed(2)),
  };
}

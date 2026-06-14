// scripts/lib/claude.mjs
//
// Anthropic SDK wrapper for the content engine. Three model-tiered functions:
//
//   draft({ topic, facts, models }) → claude-sonnet-4-6   — writes the article body
//   critique(body)                  → claude-haiku-4-5-... — originality kill-switch
//   factCheck(body, facts)          → claude-haiku-4-5-... — claims vs the data layer
//
// Sonnet does the writing (quality matters); Haiku does the cheap gate checks.
// Prompts live in scripts/prompts/*.md so editors can tune them without touching
// code. Credentials come from process.env.ANTHROPIC_API_KEY.

import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = path.join(__dirname, "..", "prompts");

// Model tiers — exact IDs (do not append date suffixes to the Sonnet alias).
const DRAFT_MODEL = "claude-sonnet-4-6";
const GATE_MODEL = "claude-haiku-4-5-20251001";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- helpers ---------------------------------------------------------------

async function loadPrompt(name) {
  return fs.readFile(path.join(PROMPT_DIR, name), "utf8");
}

/** Fill {{TOKEN}} placeholders in a template. */
function fill(template, vars) {
  return Object.entries(vars).reduce(
    (out, [k, v]) => out.split(`{{${k}}}`).join(v),
    template,
  );
}

/** Single non-streaming completion → assistant text. Throws with context on failure. */
async function complete({ model, system, user, maxTokens, label }) {
  try {
    const res = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new Error(`empty response (stop_reason: ${res.stop_reason})`);
    return text;
  } catch (err) {
    throw new Error(`[claude] ${label} failed via ${model}: ${err?.message ?? err}`, {
      cause: err,
    });
  }
}

/**
 * Parse a JSON object from a model response, tolerating ```json fences or
 * surrounding prose by extracting the first balanced {...} object.
 */
function parseJson(text, label) {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error(`[claude] ${label}: could not parse JSON from response:\n${text}`);
  }
}

// --- public API ------------------------------------------------------------

/**
 * Draft the article body from the topic + injected data layer.
 * @param {{ topic: object, facts: string, models: string }} args
 *   `facts` / `models` are the raw JSON strings of local-facts.json / models.json.
 * @returns {Promise<string>} clean Markdown body ending with a [[CTA]] placeholder.
 */
export async function draft({ topic, facts, models } = {}) {
  if (!topic?.title) throw new Error("[claude] draft requires a topic with a title");
  // Native-language drafting: Hindi topics use the Hindi prompt (not translation).
  const promptFile = topic.lang === "hi" ? "draft.hi.md" : "draft.md";
  const template = await loadPrompt(promptFile);
  const user = fill(template, {
    TITLE: topic.title,
    CATEGORY: topic.category ?? "",
    ANGLE: topic.angle ?? "",
    LOCAL_FACTS: facts,
    MODELS: models,
  });
  return complete({
    model: DRAFT_MODEL,
    user,
    maxTokens: 4000,
    label: "draft",
  });
}

/**
 * Originality kill-switch. Returns { isCommodity: boolean, reason: string }.
 * @param {string} body
 */
export async function critique(body) {
  if (!body) throw new Error("[claude] critique requires a body");
  const template = await loadPrompt("critique.md");
  const user = fill(template, { BODY: body });
  const text = await complete({
    model: GATE_MODEL,
    user,
    maxTokens: 512,
    label: "critique",
  });
  const out = parseJson(text, "critique");
  return { isCommodity: Boolean(out.isCommodity), reason: String(out.reason ?? "") };
}

/**
 * Fact-check the body against the data layer. Returns { issues: [...] } where
 * each issue is { severity: "critical"|"minor", claim, problem }.
 * @param {string} body
 * @param {{ facts: string, models: string }} data raw JSON strings of the data layer.
 */
export async function factCheck(body, { facts, models } = {}) {
  if (!body) throw new Error("[claude] factCheck requires a body");
  const template = await loadPrompt("factcheck.md");
  const user = fill(template, { BODY: body, LOCAL_FACTS: facts, MODELS: models });
  const text = await complete({
    model: GATE_MODEL,
    user,
    maxTokens: 1024,
    label: "factCheck",
  });
  const out = parseJson(text, "factCheck");
  return { issues: Array.isArray(out.issues) ? out.issues : [] };
}

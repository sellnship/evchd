// scripts/lib/claude.mjs
//
// Anthropic SDK wrapper for the content engine. Three model-tiered functions:
//
//   draft({ topic, facts, models }) → claude-sonnet-4-6   — writes the article body (prose)
//   critique(body)                  → claude-haiku-4-5-... — originality kill-switch (tool)
//   factCheck(body, facts)          → claude-haiku-4-5-... — claims vs the data layer (tool)
//
// Sonnet does the writing (quality matters); Haiku does the cheap gate checks.
//
// The two GATE functions return structured JSON. They DO NOT parse free-text:
// each forces a single tool call (`tool_choice: { type: "tool", name }`) with a
// strict input schema, and reads the result from the tool_use block's `.input`,
// which the SDK already hands back as a parsed object. That makes a malformed
// response impossible — a stray unescaped quote inside a model name (which used
// to break `JSON.parse` and kill the whole run) can never occur, because there
// is no text to parse. `parseJson` survives only as a hardened last-ditch
// fallback for the (forced-tool-choice) case that should never happen.
//
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
 * Structured completion via forced tool use. The model MUST emit exactly one
 * tool_use block matching `tool.input_schema` (`tool_choice` pins it, and
 * `strict: true` constrains the parameters to the schema). The SDK returns that
 * block's `input` as an already-parsed object — there is no JSON string to
 * fence-strip, regex, or `JSON.parse`, so malformed-JSON crashes are impossible.
 * @returns {Promise<object>} the tool_use input object.
 */
async function runTool({ model, system, user, maxTokens, label, tool }) {
  let res;
  try {
    res = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: user }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    });
  } catch (err) {
    throw new Error(`[claude] ${label} failed via ${model}: ${err?.message ?? err}`, {
      cause: err,
    });
  }

  const block = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (block && block.input && typeof block.input === "object") {
    return block.input;
  }

  // Forced tool_choice should always yield a tool_use block; reaching here is
  // pathological (e.g. a refusal). Don't hard-fail — try to recover from any
  // text the model emitted via the hardened parser.
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  console.warn(
    `[claude] ${label}: no tool_use block (stop_reason: ${res.stop_reason}) — attempting text-parse fallback.`,
  );
  return parseJson(text, label);
}

/** Strip a ```json … ``` fence (or any ``` fence) and return the inner text. */
function stripFence(text) {
  const raw = String(text ?? "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : raw).trim();
}

/** One repair pass: isolate the first balanced object and drop trailing commas. */
function repairJson(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const obj = start !== -1 && end > start ? raw.slice(start, end + 1) : raw;
  return obj
    .replace(/^﻿/, "") // strip BOM
    .replace(/,\s*([}\]])/g, "$1") // trailing commas before } or ]
    .trim();
}

/**
 * Last-ditch text → JSON parser for the (should-never-happen) case where a
 * forced tool call did not return a tool_use block. Strips markdown fences;
 * on failure, logs the full raw response and attempts ONE repair pass before
 * hard-failing — so a malformed gate response surfaces a diagnosable error in
 * the logs rather than an opaque crash.
 */
function parseJson(text, label) {
  const raw = stripFence(text);
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    console.error(
      `[claude] ${label}: JSON.parse failed (${firstErr.message}). Full raw response below:\n${text}`,
    );
    try {
      return JSON.parse(repairJson(raw));
    } catch (secondErr) {
      throw new Error(
        `[claude] ${label}: could not parse JSON from response even after repair (${secondErr.message}).`,
      );
    }
  }
}

// --- tool schemas for the gates --------------------------------------------

/** Originality kill-switch verdict. */
const ORIGINALITY_TOOL = {
  name: "report_originality_verdict",
  description:
    "Report whether the article body is commodity content (generic enough that a no-local-knowledge AI answer would match it) and must be killed.",
  input_schema: {
    type: "object",
    properties: {
      isCommodity: {
        type: "boolean",
        description: "true if the article is commodity/generic and must NOT be published.",
      },
      reason: {
        type: "string",
        description: "One short sentence explaining the verdict.",
      },
    },
    required: ["isCommodity", "reason"],
    additionalProperties: false,
  },
  strict: true,
};

/** Fact-check issue report. */
const FACTCHECK_TOOL = {
  name: "report_fact_check",
  description:
    "Report fact-check issues found in the article body, checked against the verified data layer. Return an empty issues array if every claim traces to the data.",
  input_schema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        description: "Every issue found; empty if all claims check out.",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              enum: ["critical", "warning"],
              description:
                "critical = factual contradiction, fabricated/unverifiable figure stated as fact, or value-split error (HALTS publication); warning = everything else (logged, never blocks).",
            },
            claim: {
              type: "string",
              description: "The exact claim from the article body.",
            },
            problem: {
              type: "string",
              description: "One or two short sentences naming the concrete problem.",
            },
          },
          required: ["severity", "claim", "problem"],
          additionalProperties: false,
        },
      },
    },
    required: ["issues"],
    additionalProperties: false,
  },
  strict: true,
};

// --- public API ------------------------------------------------------------

/**
 * Draft the article body from the topic + injected data layer.
 * @param {{ topic: object, facts: string, models: string }} args
 *   `facts` / `models` are the raw JSON strings of local-facts.json / models.json.
 * @returns {Promise<string>} clean Markdown body.
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
    maxTokens: 8000, // headroom so long (esp. Hindi) articles don't truncate mid-sentence
    label: "draft",
  });
}

/**
 * Originality kill-switch. Returns { isCommodity: boolean, reason: string }.
 * Structured via forced tool use — never parses free text.
 * @param {string} body
 */
export async function critique(body) {
  if (!body) throw new Error("[claude] critique requires a body");
  const template = await loadPrompt("critique.md");
  const user = fill(template, { BODY: body });
  const out = await runTool({
    model: GATE_MODEL,
    user,
    maxTokens: 512,
    label: "critique",
    tool: ORIGINALITY_TOOL,
  });
  return { isCommodity: Boolean(out.isCommodity), reason: String(out.reason ?? "") };
}

/**
 * Fact-check the body against the data layer. Returns { issues: [...] } where
 * each issue is { severity: "critical"|"warning", claim, problem }.
 * Structured via forced tool use — never parses free text.
 * @param {string} body
 * @param {{ facts: string, models: string }} data raw JSON strings of the data layer.
 */
export async function factCheck(body, { facts, models } = {}) {
  if (!body) throw new Error("[claude] factCheck requires a body");
  const template = await loadPrompt("factcheck.md");
  const user = fill(template, { BODY: body, LOCAL_FACTS: facts, MODELS: models });
  const out = await runTool({
    model: GATE_MODEL,
    user,
    maxTokens: 3000, // headroom so a long issues array never truncates mid-item
    label: "factCheck",
    tool: FACTCHECK_TOOL,
  });
  return { issues: Array.isArray(out.issues) ? out.issues : [] };
}

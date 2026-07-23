// scripts/lib/image.mjs
//
// Image generation pipeline for EV Chandigarh.
//
//   generateHero({ prompt, slug }) → 1200x675 WebP hero WITH logo watermark
//                                    → public/images/<slug>-hero.webp
//   generateCard({ prompt, slug }) → 1280x720 WebP WITHOUT watermark (cards
//                                    carry their own text) → public/images/<slug>.webp
//
// Both share the same fal generation + download; only the deterministic Sharp
// branding differs. The model does the photography; code does the consistent
// crop/brand so a wall of generated images never looks like a content farm.

import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

// fal credentials come from the environment (GitHub Actions secret FAL_KEY).
fal.config({ credentials: process.env.FAL_KEY });

// --- swappable model -------------------------------------------------------
// Isolated so the whole pipeline can move to another endpoint in one line.
// Verified against @fal-ai/client 1.10.1 + fal docs: the Imagen 4 endpoint
// accepts `aspect_ratio` and returns `data.images[0].url`.
//   "fal-ai/imagen4/preview/fast" | "fal-ai/imagen4/preview/ultra"
//   "fal-ai/flux/dev" | "fal-ai/flux-pro/v1.1" — Flux uses `image_size:
//      "landscape_16_9"` instead of `aspect_ratio`; adjust INPUT if you swap.
const MODEL = "fal-ai/imagen4";

// ⚠️ HUMAN REVIEW REQUIRED before publishing any generated image. Text-to-image
// models routinely get the VEHICLE TYPE wrong (drawing a standing kick-scooter
// instead of a seated step-through e-moped) and the CHARGING CONTEXT wrong
// (public charging station / car charger instead of a domestic wall socket).
// The prompt below steers hard against both, but every hero/card must still be
// eyeballed for (1) correct vehicle type and (2) correct setting before it goes live.

// Data-grounded vehicle form factor (src/data/models.json → form_factor), with a
// safe default so this module still works if the field/file is ever missing.
const DEFAULT_FORM_FACTOR = "seated step-through Indian electric scooter (low-speed e-moped)";
async function loadFormFactor() {
  try {
    const raw = await fs.readFile(path.join("src", "data", "models.json"), "utf8");
    const ff = JSON.parse(raw).form_factor;
    return typeof ff === "string" && ff.trim() ? ff.trim() : DEFAULT_FORM_FACTOR;
  } catch {
    return DEFAULT_FORM_FACTOR;
  }
}

// MANDATORY vehicle-form clause, PREPENDED to every prompt. This is the single
// most important constraint: text-to-image models default the word "e-scooter"
// to a standing kick-scooter (Xiaomi/Segway slim-deck), which is the wrong
// vehicle category entirely. The {formFactor} noun phrase is pulled from the
// data layer so the vehicle is grounded in real data, never the model's prior.
function vehicleClause(formFactor) {
  return (
    `The vehicle in the image is a ${formFactor} — emphatically a SEATED, STEP-THROUGH vehicle the rider ` +
    `sits down on: it has a saddle/seat, a flat floorboard for the feet, full body panelling and a front ` +
    `apron, and a step-through frame — visually similar to a Honda Activa, a TVS scooter, or a Zelio Eeva ` +
    `electric scooter. It is NOT a standing kick scooter, NOT a stand-on/Segway/Xiaomi-style scooter, ` +
    `NOT a slim-deck push scooter, and has NO standing platform.`
  );
}

// Negative terms. Imagen 4 on fal has NO negative_prompt field (verified against
// @fal-ai/client endpoints.d.ts: Imagen4PreviewInput accepts only prompt,
// aspect_ratio, num_images, output_format, resolution, safety_tolerance, seed,
// sync_mode). So we (a) embed these exclusions in the positive prompt as a hard
// "Absolutely avoid" clause — the effective way to negate with Imagen — and
// (b) pass them as a real negative_prompt ONLY if the active model supports one
// (set the flag true if you swap MODEL to a Flux/SD endpoint that accepts it).
const NEGATIVE_TERMS =
  "kick scooter, standing scooter, stand-on scooter, push scooter, Segway, Xiaomi scooter, " +
  "slim deck, foldable scooter, electric kick scooter, person standing on scooter, scooter with no seat";
const MODEL_SUPPORTS_NEGATIVE_PROMPT = false; // imagen4 → false

// Scene-agnostic context: charging guidance + Chandigarh/Mohali style. The
// per-article SCENE (charging at a socket, carrying a removable battery, monsoon,
// etc.) is supplied by the topic and slotted in between this and the vehicle clause.
const STYLE_SUFFIX =
  " If charging is shown, it is a charger cable plugged into an ordinary 3-pin domestic wall " +
  "socket on a house wall in an everyday residential setting — NO public charging station, " +
  "NO car charger, NO glowing or neon effects. " +
  "Quiet Chandigarh / Mohali modernist-concrete context, warm natural light, muted tones with " +
  "a subtle electric-blue accent, realistic editorial photograph. No text, no logos, no watermark.";

/**
 * Compose the full image prompt: mandatory vehicle clause (data-grounded) FIRST,
 * then the per-topic scene, then style. When the model can't take a negative
 * prompt, the exclusions are appended as a hard "Absolutely avoid" clause.
 * Pure + exported so the assembled prompt can be verified without calling fal.
 */
export function composePrompt(scene, formFactor = DEFAULT_FORM_FACTOR) {
  const negTail = MODEL_SUPPORTS_NEGATIVE_PROMPT ? "" : ` Absolutely avoid: ${NEGATIVE_TERMS}.`;
  return `${vehicleClause(formFactor)} Scene: ${String(scene || "").trim()}.${STYLE_SUFFIX}${negTail}`;
}

const OUT_DIR = path.join("public", "images");
const WEBP_QUALITY = 82;

// Hero: branded, 1200x675 (exact Google Discover size).
const HERO_W = 1200, HERO_H = 675;
// Card: clean, 1280x720, NO watermark (the card supplies its own text).
const CARD_W = 1280, CARD_H = 720;

// The white logo lockup composited onto hero images only.
//
// ⚠️ PLACEHOLDER: src/assets/logo-white.png is currently a generated stand-in
// (a white charge-bar mark). Drop the REAL white logo there — same path, ~180px
// wide, transparent background — and every hero picks it up automatically.
const LOGO_PATH = "src/assets/logo-white.png";
const LOGO_WIDTH = 180;
const LOGO_MARGIN = 32;

async function loadLogo() {
  try {
    const raw = await fs.readFile(LOGO_PATH);
    return await sharp(raw)
      .resize({ width: LOGO_WIDTH })
      .extend({ top: 0, left: 0, right: LOGO_MARGIN, bottom: LOGO_MARGIN, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn(`[image] no logo at ${LOGO_PATH} — writing hero without watermark (${err.message})`);
    return null;
  }
}

/** Generate a photoreal base image via fal.ai and download it to a Buffer. */
async function generateBase({ prompt, slug, label }) {
  let imageUrl;
  try {
    console.log(`[image] (1/3) generating ${label} via ${MODEL} for "${slug}"…`);
    const formFactor = await loadFormFactor();
    const input = {
      prompt: composePrompt(prompt, formFactor),
      aspect_ratio: "16:9",
      num_images: 1,
    };
    // Only send negative_prompt to a model that accepts one (imagen4 does not).
    if (MODEL_SUPPORTS_NEGATIVE_PROMPT) input.negative_prompt = NEGATIVE_TERMS;
    const result = await fal.subscribe(MODEL, { input });
    imageUrl = result?.data?.images?.[0]?.url;
    if (!imageUrl) throw new Error(`unexpected response shape: ${JSON.stringify(result?.data ?? result)}`);
  } catch (err) {
    throw new Error(`[image] fal.ai generation failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }

  try {
    console.log(`[image] (2/3) downloading base image…`);
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new Error(`[image] download failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }
}

async function write(buffer, filename) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, filename);
  await fs.writeFile(outPath, buffer);
  console.log(`[image] ✓ wrote ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
  return `/images/${filename}`;
}

/**
 * Pure branding step: resize/crop a base buffer to 1200x675 and composite the
 * logo bottom-right, returning the finished WebP as a Buffer (no disk I/O).
 * Shared by the file-mode hero write and the DB-mode Blob upload.
 */
export async function composeHeroBuffer(baseBuffer) {
  if (!Buffer.isBuffer(baseBuffer)) throw new Error("[image] composeHeroBuffer requires a Buffer");
  const logo = await loadLogo();
  let pipeline = sharp(baseBuffer).resize(HERO_W, HERO_H, { fit: "cover", position: "centre" });
  if (logo) pipeline = pipeline.composite([{ input: logo, gravity: "southeast" }]);
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
}

/**
 * Deterministically brand + crop a base buffer into a 1200x675 hero with the
 * logo watermarked bottom-right. Exported so it can be tested/reused offline.
 * @returns {Promise<string>} e.g. "/images/<slug>-hero.webp"
 */
export async function brandHero(baseBuffer, slug) {
  if (!Buffer.isBuffer(baseBuffer)) throw new Error("[image] brandHero requires a Buffer");
  if (!slug) throw new Error("[image] brandHero requires a slug");
  console.log(`[image] branding hero ${HERO_W}x${HERO_H} for "${slug}"…`);
  const out = await composeHeroBuffer(baseBuffer);
  return write(out, `${slug}-hero.webp`);
}

/**
 * DB-mode variant of generateHero: same fal generation + branding, but returns
 * the finished 1200x675 WebP as a Buffer for upload (Vercel Blob) instead of
 * writing under public/images.
 */
export async function generateHeroBuffer({ prompt, slug } = {}) {
  if (!prompt || !slug) throw new Error("[image] generateHeroBuffer requires { prompt, slug }");
  const base = await generateBase({ prompt, slug, label: "hero" });
  try {
    console.log(`[image] (3/3) branding hero (buffer)…`);
    return await composeHeroBuffer(base);
  } catch (err) {
    throw new Error(`[image] branding failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }
}

/**
 * Deterministically crop a base buffer into a clean 1280x720 card image (no
 * watermark). Exported for offline testing/reuse.
 * @returns {Promise<string>} e.g. "/images/<slug>.webp"
 */
export async function brandCard(baseBuffer, slug) {
  if (!Buffer.isBuffer(baseBuffer)) throw new Error("[image] brandCard requires a Buffer");
  if (!slug) throw new Error("[image] brandCard requires a slug");
  console.log(`[image] cropping card ${CARD_W}x${CARD_H} for "${slug}"…`);
  const out = await sharp(baseBuffer)
    .resize(CARD_W, CARD_H, { fit: "cover", position: "centre" })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  return write(out, `${slug}.webp`);
}

/**
 * Generate a branded 1200x675 hero. Throws a clear error on any failure.
 * @returns {Promise<string>} e.g. "/images/<slug>-hero.webp"
 */
export async function generateHero({ prompt, slug } = {}) {
  if (!prompt || !slug) throw new Error("[image] generateHero requires { prompt, slug }");
  const base = await generateBase({ prompt, slug, label: "hero" });
  try {
    console.log(`[image] (3/3) branding hero…`);
    return await brandHero(base, slug);
  } catch (err) {
    throw new Error(`[image] branding failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }
}

/**
 * Generate a clean 1280x720 card image (no watermark).
 * @returns {Promise<string>} e.g. "/images/<slug>.webp"
 */
export async function generateCard({ prompt, slug } = {}) {
  if (!prompt || !slug) throw new Error("[image] generateCard requires { prompt, slug }");
  const base = await generateBase({ prompt, slug, label: "card" });
  try {
    console.log(`[image] (3/3) cropping card…`);
    return await brandCard(base, slug);
  } catch (err) {
    throw new Error(`[image] card processing failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }
}

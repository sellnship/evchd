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

const PROMPT_SUFFIX =
  ". Photorealistic, natural daylight, clean composition, no text, no watermark, no logos.";

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
    const result = await fal.subscribe(MODEL, {
      input: { prompt: `${prompt}${PROMPT_SUFFIX}`, aspect_ratio: "16:9", num_images: 1 },
    });
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
 * Deterministically brand + crop a base buffer into a 1200x675 hero with the
 * logo watermarked bottom-right. Exported so it can be tested/reused offline.
 * @returns {Promise<string>} e.g. "/images/<slug>-hero.webp"
 */
export async function brandHero(baseBuffer, slug) {
  if (!Buffer.isBuffer(baseBuffer)) throw new Error("[image] brandHero requires a Buffer");
  if (!slug) throw new Error("[image] brandHero requires a slug");
  console.log(`[image] branding hero ${HERO_W}x${HERO_H} for "${slug}"…`);
  const logo = await loadLogo();
  let pipeline = sharp(baseBuffer).resize(HERO_W, HERO_H, { fit: "cover", position: "centre" });
  if (logo) pipeline = pipeline.composite([{ input: logo, gravity: "southeast" }]);
  const out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  return write(out, `${slug}-hero.webp`);
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

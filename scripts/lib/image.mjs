// scripts/lib/image.mjs
//
// Image generation pipeline for EV Chandigarh hero images.
//
// generateHero({ prompt, slug }):
//   1. generate a photoreal 16:9 base image via fal.ai (Imagen 4 by default)
//   2. download it to a buffer
//   3. deterministically brand + crop with Sharp → a Discover-ready 1200x675
//      WebP (exact size, 16:9) with the logo watermarked bottom-right
//   4. write public/images/<slug>-hero.webp and return "/images/<slug>-hero.webp"
//
// The branding step (brandHero) is intentionally identical on every run: the
// model does the photography, code does the consistent brand treatment. That
// repeatability is what stops 200 generated heroes looking like a content farm.

import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

// fal credentials come from the environment (GitHub Actions secret FAL_KEY).
fal.config({ credentials: process.env.FAL_KEY });

// --- swappable model -------------------------------------------------------
// Isolated here so the whole pipeline can move to another endpoint in one line.
// Verified against @fal-ai/client 1.10.1 + fal docs (June 2026): the Imagen 4
// endpoint accepts `aspect_ratio` and returns `data.images[0].url`.
//   "fal-ai/imagen4/preview/fast"  — cheaper / faster
//   "fal-ai/imagen4/preview/ultra" — higher quality
//   "fal-ai/flux/dev" | "fal-ai/flux-pro/v1.1" — Flux. NOTE: Flux endpoints use
//      `image_size: "landscape_16_9"` instead of `aspect_ratio`; if you swap to
//      one, adjust the INPUT object below accordingly.
const MODEL = "fal-ai/imagen4";

// Appended to every prompt to steer toward clean, text-free photography.
const PROMPT_SUFFIX =
  ". Photorealistic, natural daylight, clean composition, no text, no watermark, no logos.";

// --- brand template constants (the deterministic part) ---------------------
const OUT_W = 1200; // exact Google Discover hero width
const OUT_H = 675; // 16:9
const WEBP_QUALITY = 82;
const OUT_DIR = path.join("public", "images");

// The white logo lockup composited onto every hero.
//
// ⚠️ PLACEHOLDER: src/assets/logo-white.png is currently a simple generated
// stand-in (a white charge-bar mark). Drop the REAL white EV Chandigarh logo
// there — same path, ~180px wide, transparent background — and every hero
// picks it up automatically, no code change needed.
const LOGO_PATH = "src/assets/logo-white.png";
const LOGO_WIDTH = 180; // watermark rendered at a fixed width for consistency
const LOGO_MARGIN = 32; // inset from the bottom-right corner, in px

/**
 * Load the white logo, sized to LOGO_WIDTH and padded on the right/bottom with
 * transparency so a `southeast` composite sits LOGO_MARGIN px in from the
 * corner. Returns null (with a warning) if the logo is missing, so a missing
 * brand asset degrades to an un-watermarked hero rather than crashing.
 */
async function loadLogo() {
  try {
    const raw = await fs.readFile(LOGO_PATH);
    return await sharp(raw)
      .resize({ width: LOGO_WIDTH })
      .extend({
        top: 0,
        left: 0,
        right: LOGO_MARGIN,
        bottom: LOGO_MARGIN,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn(`[image] no logo at ${LOGO_PATH} — writing hero without watermark (${err.message})`);
    return null;
  }
}

/**
 * Deterministically brand + crop a base image buffer into the final hero.
 * Exported separately so the engine (or a test) can re-brand without
 * re-generating, and so this exact step can be unit-tested offline.
 *
 * @param {Buffer} baseBuffer  raw bytes of the source image
 * @param {string} slug        topic slug → output filename
 * @returns {Promise<string>}  public path, e.g. "/images/my-slug-hero.webp"
 */
export async function brandHero(baseBuffer, slug) {
  if (!Buffer.isBuffer(baseBuffer)) throw new Error("[image] brandHero requires a Buffer");
  if (!slug) throw new Error("[image] brandHero requires a slug");

  console.log(`[image] branding + cropping to ${OUT_W}x${OUT_H} for "${slug}"…`);
  const logo = await loadLogo();

  let pipeline = sharp(baseBuffer).resize(OUT_W, OUT_H, { fit: "cover", position: "centre" });
  if (logo) {
    pipeline = pipeline.composite([{ input: logo, gravity: "southeast" }]);
  }
  const out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();

  await fs.mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${slug}-hero.webp`);
  await fs.writeFile(outPath, out);

  const publicPath = `/images/${slug}-hero.webp`;
  console.log(`[image] ✓ wrote ${outPath} (${(out.length / 1024).toFixed(0)} KB) → ${publicPath}`);
  return publicPath;
}

/**
 * Generate a branded 1200x675 hero for a topic.
 * Throws a clear error on any failure — the engine decides what to do with it.
 *
 * @param {{ prompt: string, slug: string }} args
 * @returns {Promise<string>} public path, e.g. "/images/my-slug-hero.webp"
 */
export async function generateHero({ prompt, slug } = {}) {
  if (!prompt || !slug) throw new Error("[image] generateHero requires { prompt, slug }");

  // 1. GENERATE -------------------------------------------------------------
  let imageUrl;
  try {
    console.log(`[image] (1/3) generating base via ${MODEL} for "${slug}"…`);
    const result = await fal.subscribe(MODEL, {
      input: {
        prompt: `${prompt}${PROMPT_SUFFIX}`,
        aspect_ratio: "16:9",
        num_images: 1,
      },
    });
    // Imagen/Flux image endpoints return { data: { images: [{ url, ... }] } }.
    imageUrl = result?.data?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error(`unexpected response shape: ${JSON.stringify(result?.data ?? result)}`);
    }
  } catch (err) {
    throw new Error(`[image] fal.ai generation failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }

  // 2. DOWNLOAD -------------------------------------------------------------
  let baseBuffer;
  try {
    console.log(`[image] (2/3) downloading base image…`);
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    baseBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new Error(`[image] download failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }

  // 3. BRAND + CROP (deterministic) ----------------------------------------
  try {
    console.log(`[image] (3/3) branding…`);
    return await brandHero(baseBuffer, slug);
  } catch (err) {
    throw new Error(`[image] branding failed for "${slug}": ${err?.message ?? err}`, { cause: err });
  }
}

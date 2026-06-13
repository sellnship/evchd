// scripts/gen-icons.mjs
//
// Generate favicons + the hero watermark from the committed SVG logos. Run once
// whenever the logo changes:  npm run gen:icons
//
//   src/assets/logomark.svg       → public/favicon.svg (copy)
//                                 → public/favicon-32.png        (32x32, transparent)
//                                 → public/apple-touch-icon.png  (180x180, on a tile)
//   src/assets/logomark-white.svg → src/assets/logo-white.png    (~180px, hero watermark)
//
// Sharp rasterises the SVGs via its built-in renderer. The logomarks are pure
// shapes (no <text>), so there's no web-font dependency at raster time.
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

const MARK = path.join("src", "assets", "logomark.svg");
const MARK_WHITE = path.join("src", "assets", "logomark-white.svg");
const PUBLIC = "public";
const CONCRETE = { r: 233, g: 230, b: 223, alpha: 1 }; // --concrete tile for apple-touch-icon

async function run() {
  const mark = await fs.readFile(MARK);
  const markWhite = await fs.readFile(MARK_WHITE);

  // Modern scalable favicon — just the SVG.
  await fs.copyFile(MARK, path.join(PUBLIC, "favicon.svg"));
  console.log("✓ public/favicon.svg");

  // 32x32 PNG fallback, transparent.
  await sharp(mark, { density: 384 })
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(PUBLIC, "favicon-32.png"));
  console.log("✓ public/favicon-32.png (32x32)");

  // 180x180 Apple touch icon on a concrete tile with padding (iOS shows it on a
  // home screen, where transparency becomes black — give it a real background).
  const inner = await sharp(mark, { density: 512 })
    .resize(132, 132, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: CONCRETE } })
    .composite([{ input: inner, gravity: "centre" }])
    .png()
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));
  console.log("✓ public/apple-touch-icon.png (180x180)");

  // Hero watermark — white mark, ~180px wide, transparent. Replaces the
  // placeholder so scripts/lib/image.mjs composites the real mark.
  await sharp(markWhite, { density: 512 })
    .resize({ width: 180 })
    .png()
    .toFile(path.join("src", "assets", "logo-white.png"));
  console.log("✓ src/assets/logo-white.png (180px hero watermark)");
}

run().catch((err) => {
  console.error("✗ icon generation failed:\n", err);
  process.exit(1);
});

// scripts/test-image.mjs
//
// Smoke-test the image pipeline in isolation, before it's wired into the engine.
// Requires a fal.ai key (it actually calls the API and spends a little credit):
//
//   FAL_KEY=your_key npm run test:image
//
import { generateHero } from "./lib/image.mjs";

if (!process.env.FAL_KEY) {
  console.error("✗ FAL_KEY is not set.\n  Run:  FAL_KEY=your_key npm run test:image");
  process.exit(1);
}

const prompt =
  "An electric scooter parked on a clean Chandigarh street, modernist architecture in the background";

try {
  const out = await generateHero({ prompt, slug: "test" });
  console.log(`\n✓ Done. Hero path: ${out}`);
  console.log(`  File written to: public${out}`);
} catch (err) {
  console.error("\n✗ Image pipeline failed:\n", err);
  process.exit(1);
}

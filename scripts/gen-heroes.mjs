// scripts/gen-heroes.mjs
//
// Generate the 1200x675 branded hero images for the seed articles via fal.ai.
// Requires a key:  FAL_KEY=your_key npm run gen:heroes
//
// Slugs map to the heroImage paths in the seed frontmatter, so a real run
// overwrites the committed placeholders with no content change.
import { generateHero } from "./lib/image.mjs";

if (!process.env.FAL_KEY) {
  console.error("✗ FAL_KEY is not set.\n  Run:  FAL_KEY=your_key npm run gen:heroes");
  process.exit(1);
}

const STYLE =
  ", editorial photograph, natural daylight, Chandigarh modernist concrete context, warm-concrete tones with subtle electric-blue accent, no text, no watermark, no logos.";

const heroes = [
  { slug: "escooter-licence", prompt: "A low-speed electric scooter parked on a clean, tree-lined Chandigarh sector street" },
  { slug: "home-charging-cost", prompt: "An electric scooter charging from a domestic wall socket at an Indian home, with an electricity meter nearby" },
  { slug: "low-speed-compare", prompt: "A neat row of electric scooters parked side by side on a clean Chandigarh street" },
];

try {
  for (const h of heroes) {
    const out = await generateHero({ prompt: h.prompt + STYLE, slug: h.slug });
    console.log(`✓ ${h.slug} → ${out}`);
  }
  console.log("\n✓ Seed hero images generated.");
} catch (err) {
  console.error("\n✗ Hero generation failed:\n", err);
  process.exit(1);
}

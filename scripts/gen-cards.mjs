// scripts/gen-cards.mjs
//
// Generate the three featured-card images (1280x720, no watermark) with fal.ai.
// Requires a key:  FAL_KEY=your_key npm run gen:cards
//
// Each prompt gets the shared style suffix so the set is visually cohesive.
// Output filenames match the <img src> paths used on the homepage, so a real
// run simply overwrites the committed placeholders — no markup change needed.
import { generateCard } from "./lib/image.mjs";

if (!process.env.FAL_KEY) {
  console.error("✗ FAL_KEY is not set.\n  Run:  FAL_KEY=your_key npm run gen:cards");
  process.exit(1);
}

const STYLE =
  ", editorial photograph, natural daylight, Chandigarh modernist concrete architecture context, muted warm-concrete tones with a subtle electric-blue accent, clean and calm, no text, no watermark, no logos.";

const cards = [
  { slug: "home-charging", prompt: "An electric scooter charging from a regular wall socket at an Indian home" },
  { slug: "sector-road", prompt: "An electric scooter on a clean tree-lined Chandigarh sector road" },
  { slug: "charging-plug", prompt: "Close-up of a charging plug and electricity meter for an electric scooter" },
];

try {
  for (const c of cards) {
    const out = await generateCard({ prompt: c.prompt + STYLE, slug: c.slug });
    console.log(`✓ ${c.slug} → ${out}`);
  }
  console.log("\n✓ All three featured card images generated.");
} catch (err) {
  console.error("\n✗ Card generation failed:\n", err);
  process.exit(1);
}

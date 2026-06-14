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

// Editorial style + the vehicle/charging rules live in image.mjs PROMPT_SUFFIX,
// so each scene prompt only needs the subject. Vehicle = seated step-through
// e-moped (NOT a kick-scooter); charging = ordinary 3-pin domestic wall socket.
const heroes = [
  { slug: "escooter-licence", prompt: "A seated step-through electric scooter (Indian e-moped — seat, flat floorboard, small wheels, the kind you sit on) parked on a clean, tree-lined Chandigarh sector street, quiet residential road" },
  { slug: "home-charging-cost", prompt: "A seated step-through electric scooter (Indian e-moped) charging — charger cable plugged into an ordinary 3-pin domestic wall socket on a house wall, a home electricity meter nearby" },
  { slug: "low-speed-compare", prompt: "A neat row of seated step-through electric scooters (Indian e-mopeds — seat, flat floorboard, small wheels) parked side by side on a clean Chandigarh street" },
];

try {
  for (const h of heroes) {
    const out = await generateHero({ prompt: h.prompt, slug: h.slug });
    console.log(`✓ ${h.slug} → ${out}`);
  }
  console.log("\n✓ Seed hero images generated.");
} catch (err) {
  console.error("\n✗ Hero generation failed:\n", err);
  process.exit(1);
}

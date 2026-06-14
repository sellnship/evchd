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

// Editorial style + the vehicle/charging rules live in image.mjs PROMPT_SUFFIX,
// so each scene prompt only needs the subject. Vehicle = seated step-through
// e-moped (NOT a kick-scooter); charging = ordinary 3-pin domestic wall socket.
const cards = [
  { slug: "home-charging", prompt: "A seated step-through electric scooter (Indian e-moped — seat, flat floorboard, small wheels) parked beside a house wall, its charger cable plugged into an ordinary 3-pin domestic wall socket, everyday Indian residential setting, daytime" },
  { slug: "sector-road", prompt: "A seated step-through electric scooter (Indian e-moped — seat, flat floorboard, small wheels) on a clean, tree-lined Chandigarh sector road, modernist concrete buildings softly in the background" },
  { slug: "charging-plug", prompt: "Close-up of a charger cable plugged into an ordinary 3-pin domestic wall socket on a house wall, a home electricity meter beside it" },
];

try {
  for (const c of cards) {
    const out = await generateCard({ prompt: c.prompt, slug: c.slug });
    console.log(`✓ ${c.slug} → ${out}`);
  }
  console.log("\n✓ All three featured card images generated.");
} catch (err) {
  console.error("\n✗ Card generation failed:\n", err);
  process.exit(1);
}

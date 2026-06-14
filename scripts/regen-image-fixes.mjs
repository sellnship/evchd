// scripts/regen-image-fixes.mjs  (temporary — regenerates only the 3 fixed images)
//
//   FAL_KEY=your_key node scripts/regen-image-fixes.mjs
//
// Targets exactly the files flagged for correction, keeping the same filenames/
// paths (no markup change). image.mjs PROMPT_SUFFIX enforces: seated step-through
// e-moped (NOT a kick-scooter); home charging = ordinary 3-pin domestic wall
// socket (no public/car charger, no glow); quiet concrete editorial style.
import { generateHero, generateCard } from "./lib/image.mjs";

if (!process.env.FAL_KEY) {
  console.error("✗ FAL_KEY is not set.");
  process.exit(1);
}

const jobs = [
  {
    kind: "hero",
    slug: "escooter-licence",
    prompt:
      "A seated step-through electric scooter (Indian e-moped — seat, flat floorboard, small wheels, the kind you sit on) parked on a clean, tree-lined Chandigarh sector street, quiet residential road",
  },
  {
    kind: "card",
    slug: "home-charging",
    prompt:
      "A seated step-through electric scooter (Indian e-moped — seat, flat floorboard, small wheels) parked beside a house wall, its charger cable plugged into an ordinary 3-pin domestic wall socket, everyday Indian residential setting, daytime",
  },
  {
    kind: "card",
    slug: "sector-road",
    prompt:
      "A seated step-through electric scooter (Indian e-moped — seat, flat floorboard, small wheels) on a clean, tree-lined Chandigarh sector road, modernist concrete buildings softly in the background",
  },
];

try {
  for (const j of jobs) {
    const out = j.kind === "hero"
      ? await generateHero({ prompt: j.prompt, slug: j.slug })
      : await generateCard({ prompt: j.prompt, slug: j.slug });
    console.log(`✓ ${j.slug} (${j.kind}) → ${out}`);
  }
  console.log("\n✓ Regenerated the 3 corrected images.");
} catch (err) {
  console.error("\n✗ Regeneration failed:\n", err);
  process.exit(1);
}

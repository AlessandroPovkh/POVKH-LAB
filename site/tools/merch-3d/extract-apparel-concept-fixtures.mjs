#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const writeFixtures = process.argv.includes("--write");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const firstExisting = async (candidates) => {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* try next checkout layout */ }
  }
  throw new Error(`governed source is missing: ${candidates.join(", ")}`);
};

const capRelative = "physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/cap-field-issue/source/PVKH_COMPACT_DARK_KNOCKOUT_EXACT_1000x1000_v01.png";
const capSource = await firstExisting([
  path.resolve(siteRoot, "../production", capRelative),
  path.resolve(siteRoot, "../../../production", capRelative)
]);
const fixtures = [
  {
    source: path.join(siteRoot, "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png"),
    output: path.join(here, "sources/t-shirt-001/PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png"),
    sha256: "c46bf6bd82ea2ec6928e9fe4ca9a314b56580af49c044be0395579c43c06dada",
    resolutionPx: [1600, 600]
  },
  {
    source: path.join(siteRoot, "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png"),
    output: path.join(here, "sources/hoodie-001/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png"),
    sha256: "284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f",
    resolutionPx: [1600, 600]
  },
  {
    source: capSource,
    output: path.join(here, "sources/cap-001/PVKH_COMPACT_DARK_KNOCKOUT_EXACT_1000x1000_v01.png"),
    sha256: "a42fca876265d2c1b1a9c1e169e24cd80da2c626ed1ff8e4632d1893afcac782",
    resolutionPx: [1000, 1000]
  }
];

for (const fixture of fixtures) {
  const bytes = await readFile(fixture.source);
  assert.equal(sha256(bytes), fixture.sha256, `${fixture.source} governed hash drift`);
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual([metadata.width, metadata.height], fixture.resolutionPx, `${fixture.source} resolution drift`);
  if (writeFixtures) {
    await mkdir(path.dirname(fixture.output), { recursive: true });
    await writeFile(fixture.output, bytes);
  } else {
    assert.deepEqual(await readFile(fixture.output), bytes, `${fixture.output} drifted from its governed source`);
  }
  process.stdout.write(`${path.relative(siteRoot, fixture.output)} ${fixture.sha256} ${bytes.byteLength}\n`);
}

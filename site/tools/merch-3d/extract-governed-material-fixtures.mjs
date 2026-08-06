#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const writeFixtures = process.argv.includes("--write");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixtures = [
  {
    glb: "assets/merch-3d/collector-box-001.glb",
    texture: "Collector_Box_001_Bookcloth_Normal",
    output: "tools/merch-3d/sources/collector-box-001/PVKH_COLLECTOR_BOX_BOOKCLOTH_NORMAL_v01.png"
  },
  {
    glb: "assets/merch-3d/vinyl-001.glb",
    texture: "Vinyl_001_Deterministic_Smoke_Texture",
    output: "tools/merch-3d/sources/vinyl-001/PVKH_VINYL_SIGNAL_RED_SMOKE_TEXTURE_v01.png"
  },
  {
    glb: "assets/merch-3d/vinyl-001.glb",
    texture: "MAT_VINYL_OUTER_FRONT_MASTER_V05_Texture",
    output: "tools/merch-3d/sources/vinyl-001/PVKH_VINYL_OUTER_FRONT_MASTER_v05.approved-1024.png"
  },
  {
    glb: "assets/merch-3d/vinyl-001.glb",
    texture: "MAT_VINYL_OUTER_REVERSE_MASTER_V05_Texture",
    output: "tools/merch-3d/sources/vinyl-001/PVKH_VINYL_OUTER_REVERSE_MASTER_v05.approved-1024.png"
  }
];

const documents = new Map();
for (const fixture of fixtures) {
  const glbPath = path.join(siteRoot, fixture.glb);
  let document = documents.get(glbPath);
  if (!document) {
    document = await new NodeIO().read(glbPath);
    documents.set(glbPath, document);
  }
  const texture = document.getRoot().listTextures().find((entry) => entry.getName() === fixture.texture);
  assert.ok(texture, `${fixture.texture} is missing from ${fixture.glb}`);
  assert.equal(texture.getMimeType(), "image/png", `${fixture.texture} must remain PNG`);
  const bytes = Buffer.from(texture.getImage());
  const outputPath = path.join(siteRoot, fixture.output);
  if (writeFixtures) await writeFile(outputPath, bytes);
  else assert.deepEqual(await readFile(outputPath), bytes, `${fixture.output} drifted from the approved GLB texture`);
  process.stdout.write(`${fixture.output} ${sha256(bytes)} ${bytes.byteLength}\n`);
}

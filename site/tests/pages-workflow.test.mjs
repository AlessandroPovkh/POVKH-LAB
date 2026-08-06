import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.resolve(siteRoot, "..", ".github", "workflows", "pages.yml");

test("Pages preview provisions the media verifier required by the pixel QA suite", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const installIndex = workflow.indexOf("sudo apt-get install --yes --no-install-recommends ffmpeg");
  const testIndex = workflow.indexOf("run: npm test");

  assert.ok(installIndex >= 0, "Pages preview must explicitly provision ffmpeg and ffprobe");
  assert.ok(testIndex > installIndex, "media verification tools must be installed before npm test");
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");

test("artifact verification is portable and does not require the original render-host binaries", async () => {
  const childEnvironment = {
    ...process.env,
    PATH: "",
    PVKH_VERIFY_PHYSICAL_RENDER_TOOLCHAIN: "0"
  };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = await exec(process.execPath, ["--test", "tests/merch-motion.test.mjs"], {
    cwd: siteRoot,
    env: childEnvironment,
    maxBuffer: 8 * 1024 * 1024
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /pass 4/);
  assert.match(output, /fail 0/);
});

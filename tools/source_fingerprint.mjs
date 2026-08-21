import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { LOGO_MASTERS } from "./artifact_spec.mjs";


async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(absolute);
  }
  return files;
}


export async function sourceFingerprint(root) {
  const inputs = [
    path.join(root, "brand-board.html"),
    ...await collectFiles(path.join(root, "assets", "fonts")),
    ...LOGO_MASTERS.map(({ path: relative }) => path.join(root, relative)),
    path.join(root, "assets", "logo", "povkh-lab-construction.svg"),
    ...await collectFiles(path.join(root, "templates")),
  ].sort();

  const hash = createHash("sha256");
  for (const absolute of inputs) {
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    hash.update(relative, "utf8");
    hash.update("\0");
    hash.update(await readFile(absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

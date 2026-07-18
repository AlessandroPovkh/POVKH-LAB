import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(siteRoot, "dist");
const basePath = process.env.POVKH_SITE_BASE_PATH || "";
const testOrigin = "https://pages.invalid";
const siteOrigin = process.env.POVKH_SITE_ORIGIN || "https://povkh-lab.example";

assert.match(
  basePath,
  /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/,
  "POVKH_SITE_BASE_PATH must be a non-empty root-relative project path"
);

const listHtml = async (directory, root = directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listHtml(absolute, root));
    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  return files.sort();
};

const deployedPathFor = (relative) => {
  if (relative === "index.html") return `${basePath}/`;
  if (relative.endsWith("/index.html")) return `${basePath}/${relative.slice(0, -"index.html".length)}`;
  return `${basePath}/${relative}`;
};

const localTargetFor = (pathname) => {
  let target = decodeURIComponent(pathname.slice(basePath.length)).replace(/^\/+/, "");
  if (!target || target.endsWith("/")) target += "index.html";
  return target;
};

const htmlFiles = await listHtml(distDir);
let checkedReferences = 0;

for (const relative of htmlFiles) {
  const html = await readFile(path.join(distDir, relative), "utf8");
  assert.match(html, new RegExp(`<html\\b[^>]*\\bdata-site-base="${basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${relative} has the wrong deployment base marker`);
  const pageUrl = new URL(deployedPathFor(relative), testOrigin);
  const references = [...html.matchAll(/\s(?:href|src|data-src)="([^"]+)"/g)].map((match) => match[1]);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"[^>]*>/)?.[1];
  const alternates = [...html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)">/g)].map((match) => match[1]);
  assert.ok(canonical?.startsWith(`${siteOrigin}${basePath}/`), `${relative} canonical omits the deployment base: ${canonical}`);
  assert.equal(alternates.length, 4, `${relative} must expose four hreflang alternates`);
  assert.ok(alternates.every((url) => url.startsWith(`${siteOrigin}${basePath}/`)), `${relative} hreflang omits the deployment base`);

  for (const reference of references) {
    const resolved = new URL(reference, pageUrl);
    if (resolved.origin !== testOrigin) continue;
    assert.ok(
      resolved.pathname === basePath || resolved.pathname.startsWith(`${basePath}/`),
      `${relative} escapes the GitHub Pages project base: ${reference} -> ${resolved.pathname}`
    );
    const target = localTargetFor(resolved.pathname);
    const targetStat = await stat(path.join(distDir, target)).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    assert.ok(targetStat?.isFile(), `${relative} points to a missing local target: ${reference} -> ${target}`);
    checkedReferences += 1;
  }
}

assert.equal(htmlFiles.length, 114, "GitHub Pages artifact must contain all 114 localized HTML pages");
assert.ok(checkedReferences > 3000, `Expected a complete local-reference audit, checked only ${checkedReferences}`);
console.log(`GitHub Pages base-path QA passed for ${basePath}: ${htmlFiles.length} pages, ${checkedReferences} local references.`);

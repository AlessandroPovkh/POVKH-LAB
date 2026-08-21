import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import {
  BOARD_PDF,
  BOARD_PNG,
  EXPECTED_SHEET_COUNT,
  MANIFEST_FILE,
  RASTER_EXPORTS,
  boardPageName,
  stableManifest,
} from "./artifact_spec.mjs";
import { sourceFingerprint } from "./source_fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node tools/export_brand_board.mjs [--output-dir PATH]");
    process.exit(0);
  }
  const known = new Set(["--output-dir"]);
  let output = process.env.POVKH_EXPORT_DIR || "exports";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!known.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
      throw new Error(`${argument} requires a path`);
    }
    output = args[index + 1];
    index += 1;
  }
  const resolved = path.isAbsolute(output) ? path.resolve(output) : path.resolve(root, output);
  if (resolved === root || resolved === path.parse(resolved).root) {
    throw new Error(`Refusing unsafe export destination: ${resolved}`);
  }
  return { outputDir: resolved };
}

async function loadPlaywright() {
  try {
    return (await import("playwright")).chromium;
  } catch (error) {
    throw new Error(
      "Playwright is required for export. Run `npm install` in tools/ (or the project root), "
        + "then `npx playwright install chromium`.",
      { cause: error },
    );
  }
}

function watchPage(page, label) {
  const failures = [];
  const onPageError = (error) => failures.push(`${label}: ${error.message}`);
  const onRequestFailed = (request) => {
    failures.push(`${label}: ${request.url()} (${request.failure()?.errorText || "request failed"})`);
  };
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  return () => {
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    if (failures.length) throw new Error(failures.join("\n"));
  };
}

async function waitForPageAssets(page) {
  const brokenImages = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }),
    );
    return [...document.images]
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.src);
  });
  if (brokenImages.length) throw new Error(`Broken images: ${brokenImages.join(", ")}`);
}

function pdfPageCount(buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Exported board is not a PDF");
  const matches = buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)\b/g);
  return matches?.length || 0;
}

async function normalizePdfForReproducibility(file) {
  const epoch = Number.parseInt(process.env.SOURCE_DATE_EPOCH || "1783987200", 10);
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("SOURCE_DATE_EPOCH must be a positive integer");
  const date = new Date(epoch * 1000);
  const two = (value) => String(value).padStart(2, "0");
  const stamp = `D:${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}`
    + `${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}+00'00'`;
  const original = await readFile(file);
  let replacements = 0;
  const originalText = original.toString("latin1");
  let normalizedText = originalText.replace(
    /(\/(?:CreationDate|ModDate)\s*\()D:[^)]*(\))/g,
    (_, opening, closing) => {
      replacements += 1;
      return `${opening}${stamp}${closing}`;
    },
  );
  const structuralIds = [...new Set(normalizedText.match(/node\d{8}/g) || [])].sort();
  const canonicalIds = new Map(
    structuralIds.map((identifier, index) => [identifier, `node${String(index + 1).padStart(8, "0")}`]),
  );
  normalizedText = normalizedText.replace(/node\d{8}/g, (identifier) => canonicalIds.get(identifier));
  const normalized = Buffer.from(normalizedText, "latin1");
  if (replacements !== 2 || normalized.length !== original.length) {
    throw new Error("Could not safely normalize Chromium PDF reproducibility fields");
  }
  await writeFile(file, normalized);
}

async function writeStablePdf(page, outputPath) {
  const candidates = [];
  let previous = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const candidate = `${outputPath}.candidate-${attempt}`;
    candidates.push(candidate);
    await page.pdf({
      path: candidate,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      tagged: true,
    });
    await normalizePdfForReproducibility(candidate);
    const current = await readFile(candidate);

    if (previous?.equals(current)) {
      await rename(candidate, outputPath);
      await Promise.all(candidates.slice(0, -1).map((file) => rm(file, { force: true })));
      return;
    }
    previous = current;
  }

  await Promise.all(candidates.map((file) => rm(file, { force: true })));
  throw new Error("Chromium PDF output was not byte-stable across three consecutive renders");
}

async function publishAtomically(stageDir, outputDir) {
  const parent = path.dirname(outputDir);
  const backup = path.join(parent, `.${path.basename(outputDir)}.backup-${randomUUID()}`);
  let hadPrevious = false;
  try {
    await rename(outputDir, backup);
    hadPrevious = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    await rename(stageDir, outputDir);
  } catch (error) {
    if (hadPrevious) await rename(backup, outputDir);
    throw error;
  }
  if (hadPrevious) await rm(backup, { recursive: true, force: true });
}

async function main() {
  const { outputDir } = parseArguments();
  const sourceBefore = await sourceFingerprint(root);
  const parent = path.dirname(outputDir);
  await mkdir(parent, { recursive: true });
  const stageDir = await mkdtemp(path.join(parent, `.${path.basename(outputDir)}.stage-`));
  const pagesDir = path.join(stageDir, "board-pages");
  await mkdir(pagesDir, { recursive: true });

  const chromium = await loadPlaywright();
  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        "Chromium could not start. Install the matching browser with `npx playwright install chromium`.",
        { cause: error },
      );
    }

    const page = await browser.newPage({ viewport: { width: 1640, height: 1040 }, deviceScaleFactor: 1 });
    const assertBoardPage = watchPage(page, "brand-board.html");
    await page.goto(pathToFileURL(path.join(root, "brand-board.html")).href, { waitUntil: "networkidle" });
    await waitForPageAssets(page);
    assertBoardPage();

    const sheets = page.locator(".sheet");
    const sheetCount = await sheets.count();
    if (sheetCount !== EXPECTED_SHEET_COUNT) {
      throw new Error(`Expected ${EXPECTED_SHEET_COUNT} board sheets, found ${sheetCount}`);
    }

    await page.emulateMedia({ media: "screen" });
    await page.screenshot({
      path: path.join(stageDir, BOARD_PNG),
      fullPage: true,
      animations: "disabled",
    });
    for (let index = 0; index < sheetCount; index += 1) {
      await sheets.nth(index).screenshot({
        path: path.join(pagesDir, boardPageName(index + 1)),
        animations: "disabled",
      });
    }

    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    await writeStablePdf(page, path.join(stageDir, BOARD_PDF));

    const svgPage = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
    for (const { source, output, width, height, transparent } of RASTER_EXPORTS) {
      await svgPage.setViewportSize({ width, height });
      const assertSvgPage = watchPage(svgPage, source);
      await svgPage.goto(pathToFileURL(path.join(root, source)).href, { waitUntil: "networkidle" });
      await waitForPageAssets(svgPage);
      assertSvgPage();
      await svgPage.screenshot({
        path: path.join(stageDir, output),
        omitBackground: transparent,
        animations: "disabled",
      });
    }
    await svgPage.close();
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  } finally {
    if (browser) await browser.close();
  }

  const sourceAfter = await sourceFingerprint(root);
  if (sourceAfter !== sourceBefore) {
    await rm(stageDir, { recursive: true, force: true });
    throw new Error("Brand sources changed during export; no files were published. Run the export again.");
  }

  const pdfPath = path.join(stageDir, BOARD_PDF);
  const pages = pdfPageCount(await readFile(pdfPath));
  if (pages !== EXPECTED_SHEET_COUNT) {
    await rm(stageDir, { recursive: true, force: true });
    throw new Error(`Expected ${EXPECTED_SHEET_COUNT} PDF pages, generated ${pages}`);
  }

  await writeFile(
    path.join(stageDir, MANIFEST_FILE),
    `${JSON.stringify(stableManifest(sourceAfter), null, 2)}\n`,
    "utf8",
  );
  await publishAtomically(stageDir, outputDir);
  console.log(
    `Exported ${EXPECTED_SHEET_COUNT} board pages, a ${pages}-page PDF, ${RASTER_EXPORTS.length} rasters, `
      + `and a deterministic manifest to ${outputDir}`,
  );
}

await main();

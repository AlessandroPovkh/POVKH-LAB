import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import {
  BOARD_PDF,
  BOARD_PNG,
  EXPECTED_SHEET_COUNT,
  LOGO_MASTERS,
  MANIFEST_FILE,
  RASTER_EXPORTS,
  TEMPLATE_SPECS,
  boardPageName,
  stableManifest,
} from "./artifact_spec.mjs";
import { sourceFingerprint } from "./source_fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node tools/qa_brand_package.mjs [--exports-dir PATH]");
    process.exit(0);
  }
  let exportsValue = process.env.POVKH_EXPORT_DIR || "exports";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--exports-dir") throw new Error(`Unknown argument: ${args[index]}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
      throw new Error("--exports-dir requires a path");
    }
    exportsValue = args[index + 1];
    index += 1;
  }
  return path.isAbsolute(exportsValue) ? path.resolve(exportsValue) : path.resolve(root, exportsValue);
}

async function loadBrowserTools() {
  try {
    const [{ chromium }, axeModule] = await Promise.all([
      import("playwright"),
      import("@axe-core/playwright"),
    ]);
    return { chromium, AxeBuilder: axeModule.default };
  } catch (error) {
    throw new Error(
      "Playwright and @axe-core/playwright are required for QA. Run `npm install` in tools/ (or the project root), "
        + "then `npx playwright install chromium`.",
      { cause: error },
    );
  }
}

async function assertRegularFile(file) {
  await access(file);
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`Missing or empty file: ${file}`);
}

function svgAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];
}

async function validateLogoMaster({ path: relative, width, height, transparent }) {
  const file = path.join(root, relative);
  await assertRegularFile(file);
  const svg = await readFile(file, "utf8");
  const rootTag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!rootTag) throw new Error(`${relative} has no SVG root`);
  if (Number(svgAttribute(rootTag, "width")) !== width || Number(svgAttribute(rootTag, "height")) !== height) {
    throw new Error(`${relative} intrinsic dimensions are not ${width}x${height}`);
  }
  if (svgAttribute(rootTag, "viewBox") !== `0 0 ${width} ${height}`) {
    throw new Error(`${relative} has an invalid viewBox`);
  }
  if (!/<title(?:\s|>)/i.test(svg) || !/<path(?:\s|>)/i.test(svg)) {
    throw new Error(`${relative} lacks an accessible title or outlined paths`);
  }
  const selfContainedAsciiClip = /assets\/logo\/povkh-lab-ascii-(?:dark|reverse-transparent)-outlined\.svg$/.test(relative);
  const svgWithoutApprovedClip = selfContainedAsciiClip
    ? svg.replace('clip-path="url(#terminal-relic-clip)"', "")
    : svg;
  const forbidden = /<(?:text|image|use|script|foreignObject)(?:\s|>)|\bhref\s*=|url\s*\(|@font-face|font-family\s*:/i;
  if (forbidden.test(svgWithoutApprovedClip)) {
    throw new Error(`${relative} contains a runtime dependency or non-outlined content`);
  }
  if (selfContainedAsciiClip) {
    if (!svg.includes('<clipPath id="terminal-relic-clip">')
      || (svg.match(/clip-path="url\(#terminal-relic-clip\)"/g) || []).length !== 1) {
      throw new Error(`${relative} does not contain exactly one approved self-contained ornament clip`);
    }
  }
  const hasCanvasBackground = new RegExp(
    `<rect\\b(?=[^>]*\\bwidth=["']${width}["'])(?=[^>]*\\bheight=["']${height}["'])[^>]*>`,
    "i",
  ).test(svg);
  if (transparent === hasCanvasBackground) {
    throw new Error(`${relative} ${transparent ? "must not" : "must"} contain a full-canvas background`);
  }
}

async function validateTemplateSource(spec) {
  const file = path.join(root, spec.path);
  await assertRegularFile(file);
  const svg = await readFile(file, "utf8");
  const rootTag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!rootTag) throw new Error(`${spec.path} has no SVG root`);
  if (Number(svgAttribute(rootTag, "width")) !== spec.width || Number(svgAttribute(rootTag, "height")) !== spec.height) {
    throw new Error(`${spec.path} intrinsic dimensions are not ${spec.width}x${spec.height}`);
  }
  if (svgAttribute(rootTag, "viewBox") !== `0 0 ${spec.viewBoxWidth} ${spec.viewBoxHeight}`) {
    throw new Error(`${spec.path} has an invalid viewBox`);
  }
  if (svgAttribute(rootTag, spec.safeAttribute) !== spec.safeValue) {
    throw new Error(`${spec.path} ${spec.safeAttribute} must be "${spec.safeValue}"`);
  }
  if (svgAttribute(rootTag, "role") !== "img" || svgAttribute(rootTag, "aria-labelledby") !== "title desc") {
    throw new Error(`${spec.path} lacks the expected accessible SVG labelling`);
  }
  if (!/<title\s+id=["']title["']|<title\s[^>]*\bid=["']title["']/i.test(svg)
    || !/<desc\s+id=["']desc["']|<desc\s[^>]*\bid=["']desc["']/i.test(svg)) {
    throw new Error(`${spec.path} lacks title/desc metadata`);
  }
  if (!svg.includes("SAMPLE / NOT FOR PUBLICATION")) {
    throw new Error(`${spec.path} must carry a visible sample/publication guard`);
  }
  const criticalCount = svg.match(/\bdata-critical=["']true["']/gi)?.length || 0;
  if (criticalCount !== spec.criticalCount) {
    throw new Error(`${spec.path} has ${criticalCount} critical groups; expected ${spec.criticalCount}`);
  }
}

function parsePng(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error(`${label} is not a PNG`);
  if (buffer.toString("ascii", 12, 16) !== "IHDR") throw new Error(`${label} has no leading IHDR chunk`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}

function pngTopLeftAlpha(buffer, label) {
  const header = parsePng(buffer, label);
  if (header.bitDepth !== 8 || header.colorType !== 6) {
    throw new Error(`${label} must be an 8-bit RGBA PNG`);
  }
  const idat = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  if (!idat.length) throw new Error(`${label} has no IDAT data`);
  const firstScanline = inflateSync(Buffer.concat(idat));
  if (firstScanline.length < 5) throw new Error(`${label} has truncated pixel data`);
  // On row zero, every PNG filter predicts zero for the first pixel, so byte 4
  // is the actual alpha value of the top-left RGBA pixel.
  return firstScanline[4];
}

async function validatePng(file, width, height, transparent) {
  await assertRegularFile(file);
  const buffer = await readFile(file);
  const label = path.relative(root, file);
  const header = parsePng(buffer, label);
  if (header.width !== width || header.height !== height) {
    throw new Error(`${label} is ${header.width}x${header.height}; expected ${width}x${height}`);
  }
  if (transparent) {
    const alpha = pngTopLeftAlpha(buffer, label);
    if (alpha !== 0) throw new Error(`${label} has no transparent top-left pixel (alpha=${alpha})`);
  } else if (![2, 6].includes(header.colorType)) {
    throw new Error(`${label} has unexpected PNG colour type ${header.colorType}`);
  }
  return header;
}

function pdfPageCount(buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Brand board is not a PDF");
  if (!buffer.subarray(Math.max(0, buffer.length - 1024)).includes(Buffer.from("%%EOF"))) {
    throw new Error("Brand board PDF is truncated (missing %%EOF)");
  }
  return buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)\b/g)?.length || 0;
}

async function assertExactExports(exportsDir) {
  const rootExpected = new Set([
    BOARD_PDF,
    BOARD_PNG,
    MANIFEST_FILE,
    "board-pages",
    ...RASTER_EXPORTS.map(({ output }) => output),
  ]);
  const actualRoot = (await readdir(exportsDir, { withFileTypes: true }))
    .map(({ name }) => name)
    .filter((name) => name !== ".DS_Store");
  const missingRoot = [...rootExpected].filter((name) => !actualRoot.includes(name));
  const orphanRoot = actualRoot.filter((name) => !rootExpected.has(name));
  if (missingRoot.length || orphanRoot.length) {
    throw new Error(
      `Export set mismatch. Missing: ${missingRoot.join(", ") || "none"}; `
        + `stale/orphan: ${orphanRoot.join(", ") || "none"}`,
    );
  }

  const pagesDir = path.join(exportsDir, "board-pages");
  const pageExpected = new Set(
    Array.from({ length: EXPECTED_SHEET_COUNT }, (_, index) => boardPageName(index + 1)),
  );
  const actualPages = (await readdir(pagesDir, { withFileTypes: true }))
    .filter(({ name }) => name !== ".DS_Store")
    .map(({ name }) => name);
  const missingPages = [...pageExpected].filter((name) => !actualPages.includes(name));
  const orphanPages = actualPages.filter((name) => !pageExpected.has(name));
  if (missingPages.length || orphanPages.length) {
    throw new Error(
      `Board-page set mismatch. Missing: ${missingPages.join(", ") || "none"}; `
        + `stale/orphan: ${orphanPages.join(", ") || "none"}`,
    );
  }
}

async function main() {
  const exportsDir = parseArguments();
  const required = [
    "BRAND-GUIDE-RU.md",
    "brand-board.html",
    "content-system/FILENAME-RULES.md",
    "docs/content-playbook-ru.md",
    "assets/fonts/BarlowCondensed-Black.ttf",
    "assets/fonts/Inter-Variable.ttf",
    "assets/fonts/IBMPlexMono-Regular.ttf",
    "tools/artifact_spec.mjs",
    "tools/build_logo_outlines.py",
    "tools/export_brand_board.mjs",
    "tools/requirements.txt",
    "tools/package.json",
    "tools/package-lock.json",
    "tools/source_fingerprint.mjs",
  ];
  for (const relative of required) await assertRegularFile(path.join(root, relative));
  const canonicalFilenameFormula = "PVKH_[CAT]_[ARTIST]_[RELEASE]_[ASSET]_[RATIO_OR_SIZE_OR_DURATION]_[STATUS]_vNN_YYYYMMDD.ext";
  for (const relative of [
    "BRAND-GUIDE-RU.md",
    "brand-board.html",
    "content-system/FILENAME-RULES.md",
    "docs/content-playbook-ru.md",
  ]) {
    const text = await readFile(path.join(root, relative), "utf8");
    assert.ok(text.includes(canonicalFilenameFormula), `Canonical filename formula mismatch in ${relative}`);
    assert.doesNotMatch(text, /\[RATIO(?:-or-SIZE)?\]|_v##_/, `Legacy filename formula remains in ${relative}`);
  }
  for (const master of LOGO_MASTERS) await validateLogoMaster(master);
  for (const template of TEMPLATE_SPECS) await validateTemplateSource(template);

  await assertExactExports(exportsDir);
  const sourceSha256 = await sourceFingerprint(root);
  const manifest = JSON.parse(await readFile(path.join(exportsDir, MANIFEST_FILE), "utf8"));
  assert.deepEqual(
    manifest,
    stableManifest(sourceSha256),
    "Export manifest differs from artifact specification or current brand sources",
  );

  for (const { output, width, height, transparent } of RASTER_EXPORTS) {
    await validatePng(path.join(exportsDir, output), width, height, transparent);
  }
  for (let index = 1; index <= EXPECTED_SHEET_COUNT; index += 1) {
    await validatePng(path.join(exportsDir, "board-pages", boardPageName(index)), 1600, 1000, false);
  }

  const pdf = await readFile(path.join(exportsDir, BOARD_PDF));
  const pages = pdfPageCount(pdf);
  if (pages !== EXPECTED_SHEET_COUNT) {
    throw new Error(`Brand board PDF has ${pages} pages; expected ${EXPECTED_SHEET_COUNT}`);
  }
  const pdfDates = [...pdf.toString("latin1").matchAll(/\/(?:CreationDate|ModDate)\s*\((D:[^)]+)\)/g)]
    .map((match) => match[1]);
  if (pdfDates.length !== 2 || new Set(pdfDates).size !== 1) {
    throw new Error("Brand board PDF timestamps are absent or not normalized");
  }
  const pdfStructuralIds = [...new Set(pdf.toString("latin1").match(/node\d{8}/g) || [])].sort();
  const expectedStructuralIds = pdfStructuralIds.map((_, index) => `node${String(index + 1).padStart(8, "0")}`);
  assert.deepEqual(pdfStructuralIds, expectedStructuralIds, "Brand board PDF structural IDs are not canonical");

  const { chromium, AxeBuilder } = await loadBrowserTools();
  let browser;
  let context;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new Error(
        "Chromium could not start. Install the matching browser with `npx playwright install chromium`.",
        { cause: error },
      );
    }
    context = await browser.newContext({ viewport: { width: 1640, height: 1040 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const browserFailures = [];
    page.on("pageerror", (error) => browserFailures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserFailures.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      browserFailures.push(`${request.url()}: ${request.failure()?.errorText || "request failed"}`);
    });
    await page.goto(pathToFileURL(path.join(root, "brand-board.html")).href, { waitUntil: "networkidle" });

    const report = await page.evaluate(async () => {
      const fontRequests = [
        { family: "Barlow", query: "900 48px Barlow" },
        { family: "Inter", query: "400 20px Inter" },
        { family: "Plex", query: "400 16px Plex" },
      ];
      const loadedFonts = await Promise.all(
        fontRequests.map(async ({ family, query }) => ({
          family,
          count: (await document.fonts.load(query)).length,
          checked: document.fonts.check(query),
        })),
      );
      await document.fonts.ready;
      const faceStatuses = [...document.fonts].map(({ family, status, weight }) => ({ family, status, weight }));
      const brokenImages = [...document.images]
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.src);
      const sheets = [...document.querySelectorAll(".sheet")];
      const overflows = sheets.flatMap((sheet, index) => {
        const frame = sheet.getBoundingClientRect();
        return [...sheet.querySelectorAll("h1,h2,h3,p,img,table,.card,.grid-2,.grid-3,.grid-4,.mock-row")]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.bottom > frame.bottom + 1
              || box.right > frame.right + 1
              || box.left < frame.left - 1
              || box.top < frame.top - 1;
          })
          .map((element) => `${index + 1}:${element.tagName}.${element.className}`);
      });
      return {
        sheetCount: sheets.length,
        demoBadges: [...document.querySelectorAll(".demo-badge")].map((element) => element.textContent.trim()),
        brokenImages,
        overflows,
        loadedFonts,
        faceStatuses,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
      };
    });

    if (browserFailures.length) throw new Error(`Browser failures: ${browserFailures.join("; ")}`);
    if (report.sheetCount !== EXPECTED_SHEET_COUNT) {
      throw new Error(`Expected ${EXPECTED_SHEET_COUNT} board sheets, found ${report.sheetCount}`);
    }
    assert.equal(report.demoBadges.length, 4, "brand board must label the cover and every sample-data section");
    assert.match(report.demoBadges[0], /sample data.+not approved for publication/i);
    if (report.brokenImages.length) throw new Error(`Broken images: ${report.brokenImages.join(", ")}`);
    if (report.overflows.length) throw new Error(`Board overflow: ${report.overflows.join(", ")}`);
    const failedFonts = report.loadedFonts.filter(({ count, checked }) => count === 0 || !checked);
    const unloadedFaces = report.faceStatuses.filter(({ status }) => status !== "loaded");
    if (failedFonts.length || unloadedFaces.length) {
      throw new Error(
        `Font loading failed: requests=${JSON.stringify(failedFonts)}, faces=${JSON.stringify(unloadedFaces)}`,
      );
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    if (accessibility.violations.length) {
      const summary = accessibility.violations
        .map(({ id, impact, nodes }) => `${id} (${impact || "unknown"}, ${nodes.length} nodes)`)
        .join("; ");
      throw new Error(`Accessibility violations: ${summary}`);
    }

    const boardPng = await validatePng(
      path.join(exportsDir, BOARD_PNG),
      report.documentWidth,
      report.documentHeight,
      false,
    );
    if (boardPng.width !== 1640) throw new Error(`Board overview width must be 1640px, found ${boardPng.width}`);

    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(25);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (documentWidth > width + 1) throw new Error(`Horizontal overflow at ${width}px: ${documentWidth}px`);
    }

    const svgPage = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    for (const template of TEMPLATE_SPECS) {
      await svgPage.setViewportSize({ width: template.viewBoxWidth, height: template.viewBoxHeight });
      await svgPage.goto(pathToFileURL(path.join(root, template.path)).href, { waitUntil: "networkidle" });
      const critical = await svgPage.evaluate(async () => {
        await document.fonts.ready;
        return [...document.querySelectorAll('[data-critical="true"]')].map((element) => {
          const box = element.getBBox();
          return {
            tag: element.tagName,
            text: element.textContent?.trim().replace(/\s+/g, " ") || "",
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          };
        });
      });
      if (critical.length !== template.criticalCount) {
        throw new Error(`${template.path} rendered ${critical.length} critical groups; expected ${template.criticalCount}`);
      }
      const safeRight = template.safe.x + template.safe.width;
      const safeBottom = template.safe.y + template.safe.height;
      const epsilon = 0.05;
      const violations = critical.filter((box) => (
        box.x < template.safe.x - epsilon
        || box.y < template.safe.y - epsilon
        || box.x + box.width > safeRight + epsilon
        || box.y + box.height > safeBottom + epsilon
      ));
      if (violations.length) {
        throw new Error(`${template.path} critical content escapes its safe zone: ${JSON.stringify(violations)}`);
      }
    }
    for (const master of LOGO_MASTERS) {
      await svgPage.setViewportSize({ width: master.width, height: master.height });
      await svgPage.goto(pathToFileURL(path.join(root, master.path)).href, { waitUntil: "load" });
      const renderState = await svgPage.evaluate(() => ({
        root: document.documentElement.localName,
        paths: document.querySelectorAll("path").length,
        width: document.documentElement.getAttribute("width"),
        height: document.documentElement.getAttribute("height"),
      }));
      if (
        renderState.root !== "svg"
        || renderState.paths === 0
        || Number(renderState.width) !== master.width
        || Number(renderState.height) !== master.height
      ) {
        throw new Error(`${master.path} failed browser SVG rendering validation`);
      }
    }
    await svgPage.close();
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }

  console.log(
    `POVKH LAB production QA passed: ${EXPECTED_SHEET_COUNT} sheets/PDF pages, ${LOGO_MASTERS.length} `
      + `self-contained SVG masters, ${RASTER_EXPORTS.length} exact-size rasters, transparent alpha, `
      + "template safe zones, fonts/images, axe accessibility, responsive fit, manifest and orphan checks clean.",
  );
}

await main();

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPages } from "../src/pages.mjs";
import { validateMerchLibrary } from "../src/merch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "..");
const json = async (relative) => JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
const packageJson = await json("../package.json");
const registry = await json("../data/merch.json");
const copyAuthority = await json("../data/merch-copy-authority.json");
const catalog = await json("../data/catalog.json");
const audioLibrary = await json("../data/audio-library.json");
const artistLibrary = await json("../data/artists.json");
const readAsset = async (relative) => {
  const image = registry.objects.flatMap((object) => object.gallery).find(({ path: assetPath }) => assetPath === relative);
  return image ? { path: relative, width: image.width, height: image.height, sha256: "a".repeat(64) } : null;
};
const merchLibrary = await validateMerchLibrary(registry, copyAuthority, { readAsset });
const pages = createPages(catalog, audioLibrary, artistLibrary, merchLibrary);
const locales = ["en", "it", "ru"];
const outputFor = (locale, slug) => `${locale === "en" ? "" : `${locale}/`}merch/${slug}/index.html`;
const fragment = (html, pattern, label) => {
  const match = html.match(pattern);
  assert.ok(match, `${label} markup is missing`);
  return match[0];
};
const count = (html, pattern) => [...html.matchAll(pattern)].length;

test("accepts only an exact optional min/max orbit-limit pair", async () => {
  const valid = structuredClone(registry);
  valid.objects.find(({ slug }) => slug === "hoodie").viewer.orbitLimits = {
    min: "auto 68deg auto",
    max: "auto 98deg auto"
  };
  await assert.doesNotReject(validateMerchLibrary(valid, copyAuthority, { readAsset }));

  for (const orbitLimits of [
    { min: "auto 68deg auto" },
    { min: "auto 68deg auto", max: "auto 98deg auto", extra: "auto" },
    { min: "68", max: "auto 98deg auto" },
    { min: "auto 98deg auto", max: "auto 68deg auto" },
    { min: "auto 68deg 100%", max: "auto 98deg 1m" }
  ]) {
    const invalid = structuredClone(registry);
    invalid.objects.find(({ slug }) => slug === "hoodie").viewer.orbitLimits = orbitLimits;
    await assert.rejects(
      validateMerchLibrary(invalid, copyAuthority, { readAsset }),
      /viewer orbit limits/i
    );
  }
});

test("pins and vendors one first-party model-viewer runtime with its Apache notice", async () => {
  assert.equal(packageJson.devDependencies?.["@google/model-viewer"], "4.3.1");
  const runtime = path.join(siteRoot, "assets", "vendor", "model-viewer.min.js");
  const notice = path.join(siteRoot, "assets", "vendor", "model-viewer.LICENSE.txt");
  await access(runtime);
  await access(notice);
  const source = await readFile(runtime, "utf8");
  const license = await readFile(notice, "utf8");
  assert.ok(source.length > 100_000, "vendored runtime is unexpectedly small");
  assert.match(license, /Apache License[\s\S]*Version 2\.0/i);
});

test("renders every localized product as an inert poster-first viewer shell", () => {
  for (const locale of locales) {
    for (const object of merchLibrary.objects) {
      const html = pages.get(outputFor(locale, object.slug)).toString();
      const viewer = fragment(
        html,
        /<section class="product-viewer"[\s\S]*?<\/section>/,
        `${locale}/${object.slug} product viewer`
      );
      assert.equal(count(viewer, /data-product-viewer(?:[ >])/g), 1);
      assert.equal(count(viewer, /data-product-viewer-poster(?:[ >])/g), 1);
      assert.equal(count(viewer, /data-product-viewer-activate(?:[ >])/g), 1);
      assert.equal(count(viewer, /data-product-viewer-status(?:[ >])/g), 1);
      assert.match(viewer, new RegExp(`src="[^"]*${object.viewer.poster.replaceAll("/", "\\/")}"`));
      assert.match(viewer, new RegExp(`data-viewer-src="[^"]*${object.viewer.src.replaceAll("/", "\\/")}"`));
      assert.match(viewer, /data-viewer-module="[^"]*assets\/product-viewer\.js"/);
      assert.match(viewer, /data-viewer-runtime="[^"]*assets\/vendor\/model-viewer\.min\.js"/);
      if (object.viewer.kind === "glb") {
        assert.match(viewer, new RegExp(`data-viewer-orbit-desktop="${object.viewer.cameraOrbit.desktop}"`));
        assert.match(viewer, new RegExp(`data-viewer-orbit-mobile="${object.viewer.cameraOrbit.mobile}"`));
        assert.match(viewer, new RegExp(`data-viewer-field-of-view-desktop="${object.viewer.fieldOfView.desktop}"`));
        assert.match(viewer, new RegExp(`data-viewer-field-of-view-mobile="${object.viewer.fieldOfView.mobile}"`));
        assert.match(viewer, new RegExp(`data-viewer-camera-target-desktop="${object.viewer.cameraTarget.desktop}"`));
        assert.match(viewer, new RegExp(`data-viewer-camera-target-mobile="${object.viewer.cameraTarget.mobile}"`));
      }
      if (object.viewer.orbitLimits) {
        assert.match(viewer, new RegExp(`data-viewer-min-camera-orbit="${object.viewer.orbitLimits.min}"`));
        assert.match(viewer, new RegExp(`data-viewer-max-camera-orbit="${object.viewer.orbitLimits.max}"`));
      } else {
        assert.doesNotMatch(viewer, /data-viewer-(?:min|max)-camera-orbit=/);
      }
      assert.doesNotMatch(viewer, /<model-viewer\b/i, `${locale}/${object.slug} must not instantiate WebGL before activation`);
      assert.doesNotMatch(viewer, /<script\b/i, `${locale}/${object.slug} viewer shell must stay inert at parse time`);
      if (object.viewer.availability === "sourceBlocked") {
        assert.match(viewer, /data-viewer-availability="sourceBlocked"/);
        assert.match(viewer, /data-product-viewer-activate[^>]*disabled[^>]*aria-disabled="true"/);
        assert.doesNotMatch(viewer, /aria-label="(?:Interactive object|Oggetto interattivo|Интерактивный объект)"/);
        assert.doesNotMatch(viewer, /data-product-viewer-spin/);
      }
    }
  }
});

test("keeps the viewer launcher local, explicit, recoverable and route-disposable", async () => {
  const siteSource = await readFile(path.join(siteRoot, "assets", "site.js"), "utf8");
  const viewerSource = await readFile(path.join(siteRoot, "assets", "product-viewer.js"), "utf8");
  assert.match(siteSource, /initProductViewerLaunchers/);
  assert.match(siteSource, /data-product-viewer-activate/);
  assert.match(siteSource, /import\(moduleUrl\)/);
  assert.match(viewerSource, /customElements\.whenDefined\(["']model-viewer["']\)/);
  assert.match(viewerSource, /aria-live/);
  assert.match(viewerSource, /data-product-viewer-reset/);
  assert.match(viewerSource, /WebGL/i);
  assert.match(viewerSource, /saveData/);
  assert.match(viewerSource, /prefers-reduced-motion/);
  assert.match(viewerSource, /dataset\.viewerKind/);
  assert.match(viewerSource, /viewerKind\s*===\s*["']spin["']/);
  assert.match(viewerSource, /dracoDecoderLocation/);
  assert.match(viewerSource, /ktx2TranscoderLocation/);
  assert.match(viewerSource, /meshoptDecoderLocation/);
  assert.match(viewerSource, /meshoptDecoderLocation:\s*null/);
  assert.match(viewerSource, /lottieLoaderLocation/);
  assert.match(viewerSource, /lottie-loader\.disabled\.js/);
  assert.doesNotMatch(viewerSource, /model\.setAttribute\(["']tabindex["']/, "model host must not add a dead keyboard stop");
  assert.match(viewerSource, /aria-describedby/);
  assert.match(viewerSource, /\.userInput/);
  assert.match(viewerSource, /getDimensions\(\)/, "model readiness must inspect geometry dimensions");
  assert.match(viewerSource, /getBoundingBoxCenter\(\)/, "model readiness must inspect its bounding center");
  assert.match(viewerSource, /Number\.isFinite/, "non-finite model bounds must be rejected");
  assert.match(viewerSource, /matchMedia\(["']\(max-width: 640px\)["']\)/, "camera profiles must use the governed breakpoint");
  assert.match(viewerSource, /addEventListener\(["']change["']/, "camera profile must react to breakpoint changes");
  assert.match(viewerSource, /addEventListener\(["']camera-change["']/, "runtime must distinguish user camera interaction");
  assert.match(viewerSource, /source\s*===\s*["']user-interaction["']/, "responsive switching must preserve a user-adjusted orbit");
  assert.match(viewerSource, /setAttribute\(["']field-of-view["']/, "runtime must apply the profile field of view");
  assert.match(viewerSource, /setAttribute\(["']camera-target["']/, "runtime must apply the profile camera target");
  assert.match(viewerSource, /dataset\.viewerMinCameraOrbit/);
  assert.match(viewerSource, /dataset\.viewerMaxCameraOrbit/);
  assert.match(viewerSource, /setAttribute\(["']min-camera-orbit["']/);
  assert.match(viewerSource, /setAttribute\(["']max-camera-orbit["']/);
  assert.ok(
    viewerSource.indexOf('model.setAttribute("min-camera-orbit"') < viewerSource.indexOf('model.setAttribute("src"'),
    "runtime must apply the minimum orbit before assigning the model source"
  );
  assert.ok(
    viewerSource.indexOf('model.setAttribute("max-camera-orbit"') < viewerSource.indexOf('model.setAttribute("src"'),
    "runtime must apply the maximum orbit before assigning the model source"
  );
  assert.doesNotMatch(viewerSource, /https?:\/\//i, "runtime must not call a cloud converter, CDN or remote decoder");
});

test("renders the governed hoodie orbit limits identically in every locale", () => {
  for (const locale of locales) {
    const html = pages.get(outputFor(locale, "hoodie")).toString();
    const viewer = fragment(html, /<section class="product-viewer"[\s\S]*?<\/section>/, `${locale}/hoodie product viewer`);
    assert.match(viewer, /data-viewer-min-camera-orbit="auto 68deg auto"/);
    assert.match(viewer, /data-viewer-max-camera-orbit="auto 98deg auto"/);
  }
});

test("renders the governed cassette camera profiles identically in every locale", () => {
  for (const locale of locales) {
    const html = pages.get(outputFor(locale, "cassette")).toString();
    const viewer = fragment(html, /<section class="product-viewer"[\s\S]*?<\/section>/, `${locale}/cassette product viewer`);
    for (const attribute of [
      'data-viewer-orbit-desktop="18deg 70deg 103%"',
      'data-viewer-orbit-mobile="14deg 72deg 105%"',
      'data-viewer-field-of-view-desktop="22deg"',
      'data-viewer-field-of-view-mobile="19deg"',
      'data-viewer-camera-target-desktop="auto auto auto"',
      'data-viewer-camera-target-mobile="auto 0.078m auto"'
    ]) {
      assert.ok(viewer.includes(attribute), `${locale}/cassette is missing ${attribute}`);
    }
  }
});

test("authorizes model-viewer wasm and shadow styles without widening network policy", () => {
  for (const locale of locales) {
    const html = pages.get(outputFor(locale, "cassette")).toString();
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] || "";
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.match(csp, /img-src 'self' data: blob:/);
    assert.match(csp, /connect-src 'self' blob:/);
    assert.doesNotMatch(csp, /https?:|\*/);
  }
});

test("rejects release GLBs that would require non-vendored decoders or Lottie loaders", async () => {
  const qaSource = await readFile(path.join(siteRoot, "tools", "qa.mjs"), "utf8");
  assert.doesNotMatch(qaSource, /\.cameraOrbit\s*=/, "QA must verify camera behavior through real interaction, not an assigned orbit");
  for (const extension of [
    "KHR_draco_mesh_compression",
    "KHR_texture_basisu",
    "EXT_meshopt_compression",
    "application/lottie+json"
  ]) {
    assert.match(qaSource, new RegExp(extension.replaceAll("+", "\\+")));
  }
});

test("does not expose viewer runtime or model requests on the merch index", () => {
  for (const locale of locales) {
    const output = `${locale === "en" ? "" : `${locale}/`}merch/index.html`;
    const html = pages.get(output).toString();
    assert.doesNotMatch(html, /data-product-viewer/);
    assert.doesNotMatch(html, /assets\/merch-3d\//);
    assert.doesNotMatch(html, /model-viewer\.min\.js/);
  }
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createStaticServer } from "../tools/server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const merch = JSON.parse(await readFile(path.join(siteRoot, "data/merch.json"), "utf8"));
const interactive = merch.objects.filter(({ viewer }) => viewer.kind === "glb");
const blocked = merch.objects.filter(({ viewer }) => viewer.availability === "sourceBlocked");
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } }
];
const heavyRequest = /(?:assets\/product-viewer\.js|assets\/vendor\/model-viewer\.min\.js|assets\/merch-3d\/)/;

let app;
let baseUrl;
let browser;

before(async () => {
  app = createStaticServer({ root: path.join(siteRoot, "dist") });
  baseUrl = await app.listen();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await app?.close();
});

const modelEvidence = (page) => page.locator("model-viewer").evaluate(async (model) => {
  const dimensions = model.getDimensions();
  const center = model.getBoundingBoxCenter();
  const orbit = model.getCameraOrbit();
  const target = model.getCameraTarget();
  const blob = await model.toBlob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let visiblePixels = 0;
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] > 0) visiblePixels += 1;
  }
  bitmap.close();
  return {
    attributes: {
      orbit: model.getAttribute("camera-orbit"),
      fieldOfView: model.getAttribute("field-of-view"),
      target: model.getAttribute("camera-target")
    },
    dimensions: [dimensions.x, dimensions.y, dimensions.z],
    center: [center.x, center.y, center.z],
    orbit: [orbit.theta, orbit.phi, orbit.radius],
    target: [target.x, target.y, target.z],
    fieldOfView: model.getFieldOfView(),
    visiblePixels
  };
});

test("activates every released GLB poster-first with exact governed cameras and visible geometry", { timeout: 180_000 }, async () => {
  assert.equal(interactive.length, 8, "DROP 001 must expose eight governed GLB viewers");

  for (const profile of profiles) {
    for (const object of interactive) {
      const context = await browser.newContext({ reducedMotion: "no-preference" });
      const page = await context.newPage();
      const requests = [];
      const errors = [];
      page.on("request", (request) => requests.push(request.url()));
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize(profile.viewport);
      await page.goto(`${baseUrl}/merch/${object.slug}/`, { waitUntil: "load" });
      assert.deepEqual(
        requests.filter((url) => heavyRequest.test(url)),
        [],
        `${profile.name}/${object.slug} eagerly fetched the 3D runtime or model`
      );

      const activationStart = requests.length;
      await page.locator("[data-product-viewer-activate]").click();
      await page.waitForFunction(
        () => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready",
        null,
        { timeout: 20_000 }
      );
      const activationRequests = requests.slice(activationStart);
      assert.ok(
        activationRequests.some((url) => url.endsWith(`/${object.viewer.src}`)),
        `${profile.name}/${object.slug} did not request ${object.viewer.src}`
      );
      assert.equal(
        activationRequests.some((url) => new URL(url).origin !== baseUrl),
        false,
        `${profile.name}/${object.slug} made a third-party request`
      );

      const evidence = await modelEvidence(page);
      assert.deepEqual(evidence.attributes, {
        orbit: object.viewer.cameraOrbit[profile.name],
        fieldOfView: object.viewer.fieldOfView[profile.name],
        target: object.viewer.cameraTarget[profile.name]
      });
      assert.ok(evidence.dimensions.every((value) => Number.isFinite(value) && value > 0), `${profile.name}/${object.slug} has invalid dimensions`);
      assert.ok(evidence.center.every(Number.isFinite), `${profile.name}/${object.slug} has an invalid center`);
      assert.ok(evidence.orbit.every(Number.isFinite), `${profile.name}/${object.slug} has an invalid camera orbit`);
      assert.ok(evidence.target.every(Number.isFinite), `${profile.name}/${object.slug} has an invalid camera target`);
      assert.ok(Number.isFinite(evidence.fieldOfView) && evidence.fieldOfView > 0, `${profile.name}/${object.slug} has an invalid field of view`);
      assert.ok(evidence.visiblePixels > 0, `${profile.name}/${object.slug} rendered no visible geometry`);
      assert.deepEqual(errors, [], `${profile.name}/${object.slug} emitted a page error`);

      await page.locator("[data-product-viewer-reset]").click();
      await page.waitForFunction(
        ({ orbit, fieldOfView, target }) => {
          const model = document.querySelector("model-viewer");
          return model?.getAttribute("camera-orbit") === orbit
            && model.getAttribute("field-of-view") === fieldOfView
            && model.getAttribute("camera-target") === target;
        },
        {
          orbit: object.viewer.cameraOrbit[profile.name],
          fieldOfView: object.viewer.fieldOfView[profile.name],
          target: object.viewer.cameraTarget[profile.name]
        }
      );
      await context.close();
    }
  }
});

test("keeps source-blocked apparel honest and network-inert", { timeout: 30_000 }, async () => {
  assert.deepEqual(blocked.map(({ slug }) => slug).sort(), ["cap", "hoodie", "t-shirt"]);
  const context = await browser.newContext();
  for (const object of blocked) {
    const page = await context.newPage();
    const requests = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/merch/${object.slug}/`, { waitUntil: "load" });
    const activation = page.locator("[data-product-viewer-activate]");
    assert.equal(await activation.isDisabled(), true, `${object.slug} must not expose a synthetic garment spin`);
    assert.deepEqual(requests.filter((url) => heavyRequest.test(url)), [], `${object.slug} fetched blocked viewer assets`);
    await page.close();
  }
  await context.close();
});

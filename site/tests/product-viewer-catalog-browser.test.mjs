import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, errors as playwrightErrors } from "playwright";
import { createStaticServer } from "../tools/server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFile = promisify(execFileCallback);
const merch = JSON.parse(await readFile(path.join(siteRoot, "data/merch.json"), "utf8"));
const interactive = merch.objects.filter(({ viewer }) => viewer.kind === "glb");
const blocked = merch.objects.filter(({ viewer }) => viewer.availability === "sourceBlocked");
const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } }
];
const heavyRequest = /(?:assets\/product-viewer\.js|assets\/vendor\/model-viewer\.min\.js|assets\/merch-3d\/)/;
const deg = (value) => value * Math.PI / 180;
const closeTo = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
};
const waitForRequestQuiet = async (lastRequestAt, { quietMs = 750, timeoutMs = 5_000 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = quietMs - (Date.now() - lastRequestAt());
    if (remaining <= 0) return;
    await delay(Math.min(remaining, 100));
  }
  assert.fail(`network did not remain quiet for ${quietMs}ms`);
};

let app;
let baseUrl;
let browser;

before(async () => {
  await execFile(process.execPath, [path.join(siteRoot, "tools/build.mjs")], { cwd: siteRoot });
  app = createStaticServer({ root: path.join(siteRoot, "dist") });
  baseUrl = await app.listen();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await app?.close();
});

const modelEvidence = (page, { pixels = false } = {}) => page.locator("model-viewer").evaluate(async (model, includePixels) => {
  const dimensions = model.getDimensions();
  const center = model.getBoundingBoxCenter();
  const orbit = model.getCameraOrbit();
  const target = model.getCameraTarget();
  let visiblePixels = null;
  if (includePixels) {
    const blob = await model.toBlob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    visiblePixels = 0;
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] > 0) visiblePixels += 1;
    }
    bitmap.close();
  }
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
}, pixels);

const assertGovernedCamera = (evidence, object, profileName, { pixels = false } = {}) => {
  const orbit = object.viewer.cameraOrbit[profileName];
  const fieldOfView = object.viewer.fieldOfView[profileName];
  const target = object.viewer.cameraTarget[profileName];
  assert.deepEqual(evidence.attributes, { orbit, fieldOfView, target });
  const [theta, phi] = orbit.split(" ").slice(0, 2).map((token) => deg(Number.parseFloat(token)));
  closeTo(evidence.orbit[0], theta, 0.003, `${profileName}/${object.slug} theta`);
  closeTo(evidence.orbit[1], phi, 0.003, `${profileName}/${object.slug} phi`);
  closeTo(evidence.fieldOfView, Number.parseFloat(fieldOfView), 0.03, `${profileName}/${object.slug} field of view`);
  const expectedTarget = target.split(" ").map((token, axis) => token === "auto" ? evidence.center[axis] : Number.parseFloat(token));
  expectedTarget.forEach((value, axis) => closeTo(evidence.target[axis], value, 0.002, `${profileName}/${object.slug} target axis ${axis}`));
  assert.ok(evidence.dimensions.every((value) => Number.isFinite(value) && value > 0), `${profileName}/${object.slug} has invalid dimensions`);
  assert.ok(evidence.center.every(Number.isFinite), `${profileName}/${object.slug} has an invalid center`);
  assert.ok(evidence.orbit.every(Number.isFinite), `${profileName}/${object.slug} has an invalid camera orbit`);
  assert.ok(evidence.target.every(Number.isFinite), `${profileName}/${object.slug} has an invalid camera target`);
  assert.ok(Number.isFinite(evidence.orbit[2]) && evidence.orbit[2] > 0, `${profileName}/${object.slug} has an invalid camera radius`);
  if (pixels) assert.ok(evidence.visiblePixels > 0, `${profileName}/${object.slug} rendered no visible geometry`);
};

const perturbCamera = async (page, initialTheta, label) => {
  const viewer = page.locator("model-viewer");
  const box = await viewer.boundingBox();
  assert.ok(box, `${label} has no viewer pointer surface`);
  const trajectories = [
    { start: [0.39, 0.44], end: [0.70, 0.55] },
    { start: [0.62, 0.42], end: [0.30, 0.57] },
    { start: [0.48, 0.62], end: [0.72, 0.38] }
  ];
  let validPointerSurface = false;

  for (const trajectory of trajectories) {
    const start = {
      x: box.x + box.width * trajectory.start[0],
      y: box.y + box.height * trajectory.start[1]
    };
    const hit = await viewer.evaluate((model, point) => {
      const target = model.shadowRoot?.elementFromPoint(point.x, point.y);
      return {
        id: target?.id || "",
        reachesUserInput: Boolean(model.shadowRoot?.querySelector(".userInput")?.contains(target))
      };
    }, start);
    if (hit.id === "default-pan-target" || !hit.reachesUserInput) continue;
    validPointerSurface = true;

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    try {
      await page.mouse.move(
        box.x + box.width * trajectory.end[0],
        box.y + box.height * trajectory.end[1],
        { steps: 12 }
      );
    } finally {
      await page.mouse.up();
    }

    const moved = await page.waitForFunction(
      (theta) => {
        const currentTheta = document.querySelector("model-viewer")?.getCameraOrbit().theta;
        return Number.isFinite(currentTheta) && Math.abs(currentTheta - theta) > 0.03;
      },
      initialTheta,
      { timeout: 5_000 }
    ).then(() => true, (error) => {
      if (error instanceof playwrightErrors.TimeoutError) return false;
      throw error;
    });
    if (moved) {
      await delay(250);
      return;
    }
  }

  assert.equal(validPointerSurface, true, `${label} has no usable model-viewer orbit input surface`);
  const finalTheta = await viewer.evaluate((model) => model.getCameraOrbit().theta);
  assert.fail(`${label} ignored all real pointer-drag trajectories (initial theta ${initialTheta}, final theta ${finalTheta})`);
};

test("activates every released GLB poster-first with exact governed cameras and visible geometry", { timeout: 180_000 }, async () => {
  assert.equal(interactive.length, 11, "DROP 001 must expose eleven governed GLB viewers");

  for (const profile of profiles) {
    for (const object of interactive) {
      const context = await browser.newContext({ reducedMotion: "no-preference" });
      const page = await context.newPage();
      const requests = [];
      const errors = [];
      let lastRequestAt = Date.now();
      page.on("request", (request) => {
        requests.push(request.url());
        lastRequestAt = Date.now();
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize(profile.viewport);
      await page.goto(`${baseUrl}/merch/${object.slug}/`, { waitUntil: "networkidle" });
      const apparelMobile = profile.name === "mobile" && ["t-shirt", "hoodie", "cap"].includes(object.slug);
      const inactiveStage = apparelMobile ? await page.locator("[data-product-viewer-stage]").boundingBox() : null;
      if (inactiveStage) {
        closeTo(inactiveStage.width, 358, 1, `mobile/${object.slug} inactive stage width`);
        closeTo(inactiveStage.height, 239, 1, `mobile/${object.slug} inactive poster height`);
      }
      assert.deepEqual(
        requests.filter((url) => heavyRequest.test(url)),
        [],
        `${profile.name}/${object.slug} eagerly fetched the 3D runtime or model`
      );
      assert.equal(
        requests.some((url) => new URL(url).origin !== baseUrl),
        false,
        `${profile.name}/${object.slug} made a third-party request before activation`
      );

      const activationStart = requests.length;
      await page.locator("[data-product-viewer-activate]").click();
      await page.waitForFunction(
        () => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready",
        null,
        { timeout: 20_000 }
      );
      if (apparelMobile) {
        const activeStage = await page.locator("[data-product-viewer-stage]").boundingBox();
        assert.ok(activeStage.height >= 500 && activeStage.height <= 521, `mobile/${object.slug} activated stage must provide an inspection-height canvas: ${activeStage.height}`);
        closeTo(activeStage.width, inactiveStage.width, 1, `mobile/${object.slug} active stage width`);
        const layout = await page.evaluate(() => ({
          active: document.querySelector("[data-product-viewer]")?.classList.contains("product-viewer--active"),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        }));
        assert.deepEqual(layout, { active: true, overflow: 0 }, `mobile/${object.slug} activated layout must remain contained`);
      }
      await waitForRequestQuiet(() => lastRequestAt);
      const activationRequests = requests.slice(activationStart);
      assert.ok(
        activationRequests.some((url) => url.endsWith(`/${object.viewer.src}`)),
        `${profile.name}/${object.slug} did not request ${object.viewer.src}`
      );
      assert.equal(
        requests.some((url) => new URL(url).origin !== baseUrl),
        false,
        `${profile.name}/${object.slug} made a third-party request`
      );

      const evidence = await modelEvidence(page, { pixels: true });
      assertGovernedCamera(evidence, object, profile.name, { pixels: true });
      assert.deepEqual(errors, [], `${profile.name}/${object.slug} emitted a page error`);

      await perturbCamera(page, evidence.orbit[0], `${profile.name}/${object.slug}`);
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
      assertGovernedCamera(await modelEvidence(page), object, profile.name);
      await context.close();
    }
  }
});

test("releases all apparel concept GLBs without blocked controls or eager model requests", { timeout: 30_000 }, async () => {
  assert.deepEqual(blocked, []);
  for (const profile of profiles) {
    const context = await browser.newContext();
    for (const object of merch.objects.filter(({ slug }) => ["cap", "hoodie", "t-shirt"].includes(slug))) {
      const page = await context.newPage();
      const requests = [];
      page.on("request", (request) => requests.push(request.url()));
      await page.setViewportSize(profile.viewport);
      await page.goto(`${baseUrl}/merch/${object.slug}/`, { waitUntil: "networkidle" });
      const activation = page.locator("[data-product-viewer-activate]");
      assert.equal(await activation.isDisabled(), false, `${profile.name}/${object.slug} concept GLB must be activatable`);
      assert.deepEqual(requests.filter((url) => heavyRequest.test(url)), [], `${profile.name}/${object.slug} fetched viewer assets before activation`);
      assert.equal(requests.some((url) => new URL(url).origin !== baseUrl), false, `${profile.name}/${object.slug} made a third-party request`);
      await page.close();
    }
    await context.close();
  }
});

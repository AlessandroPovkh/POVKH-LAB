import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createStaticServer } from "../tools/server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deg = (value) => value * Math.PI / 180;
const closeTo = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, received ${actual}`);
};
const governed = {
  desktop: {
    orbit: "18deg 70deg 103%",
    theta: deg(18),
    phi: deg(70),
    fieldOfView: "22deg",
    fieldOfViewNumber: 22,
    target: "auto auto auto"
  },
  mobile: {
    orbit: "14deg 72deg 105%",
    theta: deg(14),
    phi: deg(72),
    fieldOfView: "19deg",
    fieldOfViewNumber: 19,
    target: "auto 0.078m auto"
  }
};

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

const cameraState = (page, { pixels = false } = {}) => page.locator("model-viewer").evaluate(async (model, includePixels) => {
  const orbit = model.getCameraOrbit();
  const target = model.getCameraTarget();
  const dimensions = model.getDimensions();
  const center = model.getBoundingBoxCenter();
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
    orbit: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius },
    fieldOfView: model.getFieldOfView(),
    target: { x: target.x, y: target.y, z: target.z },
    dimensions: { x: dimensions.x, y: dimensions.y, z: dimensions.z },
    center: { x: center.x, y: center.y, z: center.z },
    visiblePixels
  };
}, pixels);

const assertCamera = (state, profile, { pixels = false } = {}) => {
  assert.deepEqual(state.attributes, {
    orbit: profile.orbit,
    fieldOfView: profile.fieldOfView,
    target: profile.target
  });
  closeTo(state.orbit.theta, profile.theta, 0.002, "camera theta");
  closeTo(state.orbit.phi, profile.phi, 0.002, "camera phi");
  closeTo(state.fieldOfView, profile.fieldOfViewNumber, 0.02, "field of view");
  assert.ok(Number.isFinite(state.orbit.radius) && state.orbit.radius > 0, "camera radius must be finite and positive");
  assert.ok(Object.values(state.target).every(Number.isFinite), "camera target must be finite");
  assert.ok(Object.values(state.dimensions).every((value) => Number.isFinite(value) && value > 0), "model dimensions must be finite and positive");
  assert.ok(Object.values(state.center).every(Number.isFinite), "model center must be finite");
  if (profile === governed.mobile) closeTo(state.target.y, 0.078, 0.002, "mobile camera target y");
  if (pixels) assert.ok(state.visiblePixels > 0, "real cassette must render a visible pixel signal");
};

const waitForCameraIdle = (page) => page.locator("model-viewer").evaluate((model) => new Promise((resolve) => {
  let quietTimer;
  let maxTimer;
  const finish = () => {
    clearTimeout(quietTimer);
    clearTimeout(maxTimer);
    model.removeEventListener("camera-change", onCameraChange);
    resolve();
  };
  const onCameraChange = () => {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(finish, 250);
  };
  model.addEventListener("camera-change", onCameraChange);
  quietTimer = setTimeout(finish, 250);
  maxTimer = setTimeout(finish, 5_000);
}));

const activateCassette = async (context, viewport) => {
  const page = await context.newPage();
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/merch/cassette/`, { waitUntil: "load" });
  const heavyRequest = /(?:product-viewer\.js|model-viewer|assets\/merch-3d\/)/;
  assert.deepEqual(requests.filter((url) => heavyRequest.test(url)), [], "poster-first page eagerly fetched viewer code or GLB");
  const activationStart = requests.length;
  await page.locator("[data-product-viewer-activate]").click();
  await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready");
  const activationRequests = requests.slice(activationStart);
  assert.ok(activationRequests.some((url) => /assets\/merch-3d\/cassette-002\.glb$/.test(url)), "activation did not request the real cassette GLB");
  assert.equal(activationRequests.some((url) => /model-viewer-support/.test(url)), false, "activation requested a decoder fallback");
  assert.equal(activationRequests.some((url) => new URL(url).origin !== baseUrl), false, "activation made a third-party request");
  return page;
};

test("applies governed desktop metadata, preserves pointer orbit on mobile switch, and resets the current profile", { timeout: 60_000 }, async () => {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await activateCassette(context, { width: 1440, height: 1000 });
  await page.waitForFunction(() => Math.abs(document.querySelector("model-viewer")?.getFieldOfView() - 22) < 0.02);
  assertCamera(await cameraState(page, { pixels: true }), governed.desktop, { pixels: true });

  const box = await page.locator("model-viewer").boundingBox();
  assert.ok(box, "model viewer has no pointer target");
  const pointerStart = {
    x: box.x + box.width * 0.4,
    y: box.y + box.height * 0.45
  };
  const pointerHit = await page.locator("model-viewer").evaluate((model, point) => {
    const hit = model.shadowRoot?.elementFromPoint(point.x, point.y);
    return {
      id: hit?.id || "",
      reachesUserInput: Boolean(model.shadowRoot?.querySelector(".userInput")?.contains(hit))
    };
  }, pointerStart);
  assert.notEqual(pointerHit.id, "default-pan-target", "drag must not start on model-viewer's pan target");
  assert.equal(pointerHit.reachesUserInput, true, "drag must start on the orbit input surface");
  await page.mouse.move(pointerStart.x, pointerStart.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.58, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction((initialTheta) => {
    const theta = document.querySelector("model-viewer")?.getCameraOrbit().theta;
    return Number.isFinite(theta) && Math.abs(theta - initialTheta) > 0.03;
  }, governed.desktop.theta);
  await waitForCameraIdle(page);
  const interacted = await cameraState(page);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForFunction(() => {
    const model = document.querySelector("model-viewer");
    return model?.getAttribute("field-of-view") === "19deg"
      && model.getAttribute("camera-target") === "auto 0.078m auto";
  });
  const switched = await cameraState(page);
  closeTo(switched.orbit.theta, interacted.orbit.theta, 0.015, "user theta after profile switch");
  closeTo(switched.orbit.phi, interacted.orbit.phi, 0.015, "user phi after profile switch");
  assert.equal(switched.attributes.fieldOfView, governed.mobile.fieldOfView);
  assert.equal(switched.attributes.target, governed.mobile.target);
  closeTo(switched.fieldOfView, governed.mobile.fieldOfViewNumber, 0.02, "mobile field of view after switch");
  closeTo(switched.target.y, 0.078, 0.002, "mobile target after switch");

  await page.locator("[data-product-viewer-reset]").click();
  await page.waitForFunction((profile) => {
    const model = document.querySelector("model-viewer");
    return model?.getAttribute("camera-orbit") === profile.orbit
      && Math.abs(model.getCameraOrbit().theta - profile.theta) < 0.002
      && Math.abs(model.getFieldOfView() - profile.fieldOfViewNumber) < 0.02;
  }, governed.mobile);
  assertCamera(await cameraState(page), governed.mobile);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction((profile) => {
    const model = document.querySelector("model-viewer");
    return model?.getAttribute("camera-orbit") === profile.orbit
      && Math.abs(model.getCameraOrbit().theta - profile.theta) < 0.002
      && Math.abs(model.getFieldOfView() - profile.fieldOfViewNumber) < 0.02;
  }, governed.desktop);
  assertCamera(await cameraState(page), governed.desktop);
  await context.close();
});

test("activates the real cassette directly into the governed mobile profile", { timeout: 30_000 }, async () => {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await activateCassette(context, { width: 375, height: 812 });
  await page.waitForFunction(() => Math.abs(document.querySelector("model-viewer")?.getFieldOfView() - 19) < 0.02);
  assertCamera(await cameraState(page, { pixels: true }), governed.mobile, { pixels: true });
  await context.close();
});

import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createStaticServer } from "../tools/server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = process.env.PVKH_VIEWER_BENCHMARK_OUTPUT
  ? path.resolve(process.env.PVKH_VIEWER_BENCHMARK_OUTPUT)
  : path.join(siteRoot, "artifacts/qa/product-viewer-performance.json");
const execFile = promisify(execFileCallback);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, digits = 2) => Number(value.toFixed(digits));
const heavyRequestPattern = /\/assets\/(?:product-viewer\.js|vendor\/model-viewer\.min\.js|merch-3d\/|model-viewer-support\/)/;
const networkProfile = {
  label: "CDP Fast 4G",
  latencyMs: 150,
  downloadBytesPerSecond: 4 * 1024 * 1024 / 8,
  uploadBytesPerSecond: 3 * 1024 * 1024 / 8,
  connectionType: "cellular4g"
};
const deviceProfile = {
  viewport: { width: 393, height: 851 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
  reducedMotion: "no-preference"
};
const coverage = [
  { slug: "vinyl", assetKey: "vinyl-001", route: "/merch/vinyl/", modelPath: "assets/merch-3d/vinyl-001.glb" },
  { slug: "cd", assetKey: "disc-004", route: "/merch/cd/", modelPath: "assets/merch-3d/disc-004.glb" },
  { slug: "cassette", assetKey: "cassette-002", route: "/merch/cassette/", modelPath: "assets/merch-3d/cassette-002.glb" },
  { slug: "cap", assetKey: "cap-001", route: "/merch/cap/", modelPath: "assets/merch-3d/cap-001.glb" },
  { slug: "zine-booklet", assetKey: "zine-001", route: "/merch/zine-booklet/", modelPath: "assets/merch-3d/zine-001.glb" }
];
const recommendedCiGates = {
  calibration: "broad regression ceilings derived from two independent calibration runs of three cold samples per asset; not release acceptance",
  executionPolicy: "opt-in diagnostic on a calibrated, isolated and serial runner; excluded from default CI",
  defaultCiGate: false,
  samplesPerAsset: 3,
  preactivationHeavyRequests: 0,
  thirdPartyActivationRequests: 0,
  contextLosses: 0,
  releaseTargets: {
    coldClickToReadyMs: 2_500,
    minDragFramesPerSecond: 50,
    maxDragLongTaskCount: 0,
    physicalAndroidRequired: true
  },
  labRegressionCeilings: {
    vinyl: {
      maxColdClickToReadyMs: 8_000,
      maxFirstPartyTransferredBytes: 2_500_000,
      minVisiblePixels: 50_000,
      maxActivationLongTaskCount: 5,
      maxActivationLongTaskTotalMs: 2_500,
      minDragFramesPerSecond: 24,
      maxDragP95FrameIntervalMs: 90,
      maxDragLongTaskCount: 12,
      maxDragLongTaskTotalMs: 700,
      minOrbitDeltaRad: 0.1
    },
    cd: {
      maxColdClickToReadyMs: 8_000,
      maxFirstPartyTransferredBytes: 2_500_000,
      minVisiblePixels: 50_000,
      maxActivationLongTaskCount: 5,
      maxActivationLongTaskTotalMs: 2_500,
      minDragFramesPerSecond: 28,
      maxDragP95FrameIntervalMs: 75,
      maxDragLongTaskCount: 5,
      maxDragLongTaskTotalMs: 250,
      minOrbitDeltaRad: 0.1
    },
    cap: {
      maxColdClickToReadyMs: 8_000,
      maxFirstPartyTransferredBytes: 2_500_000,
      minVisiblePixels: 50_000,
      maxActivationLongTaskCount: 5,
      maxActivationLongTaskTotalMs: 2_500,
      minDragFramesPerSecond: 24,
      maxDragP95FrameIntervalMs: 90,
      maxDragLongTaskCount: 12,
      maxDragLongTaskTotalMs: 700,
      minOrbitDeltaRad: 0.1
    },
    "zine-booklet": {
      maxColdClickToReadyMs: 5_500,
      maxFirstPartyTransferredBytes: 1_250_000,
      minVisiblePixels: 50_000,
      maxActivationLongTaskCount: 5,
      maxActivationLongTaskTotalMs: 2_000,
      minDragFramesPerSecond: 45,
      maxDragP95FrameIntervalMs: 50,
      maxDragLongTaskCount: 1,
      maxDragLongTaskTotalMs: 100,
      minOrbitDeltaRad: 0.1
    }
  }
};

let app;
let baseUrl;
let browser;
let benchmarkReport;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

const percentile = (values, percentileValue) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentileValue / 100 * sorted.length) - 1);
  return sorted[index];
};

const summarize = (samples) => ({
  sampleCount: samples.length,
  coldClickToReadyMs: {
    median: round(median(samples.map((sample) => sample.coldClickToReadyMs))),
    max: round(Math.max(...samples.map((sample) => sample.coldClickToReadyMs)))
  },
  firstPartyTransferredBytes: {
    median: Math.round(median(samples.map((sample) => sample.firstPartyTransferredBytes))),
    max: Math.max(...samples.map((sample) => sample.firstPartyTransferredBytes))
  },
  visiblePixels: {
    median: Math.round(median(samples.map((sample) => sample.visiblePixels))),
    min: Math.min(...samples.map((sample) => sample.visiblePixels))
  },
  activationLongTasks: {
    maxCount: Math.max(...samples.map((sample) => sample.activationLongTasks.count)),
    maxTotalMs: round(Math.max(...samples.map((sample) => sample.activationLongTasks.totalMs)))
  },
  drag: {
    minFramesPerSecond: round(Math.min(...samples.map((sample) => sample.drag.framesPerSecond))),
    maxP95FrameIntervalMs: round(Math.max(...samples.map((sample) => sample.drag.p95FrameIntervalMs))),
    maxLongTaskCount: Math.max(...samples.map((sample) => sample.drag.longTasks.count)),
    maxLongTaskTotalMs: round(Math.max(...samples.map((sample) => sample.drag.longTasks.totalMs))),
    minOrbitDeltaRad: round(Math.min(...samples.map((sample) => sample.drag.orbitDeltaRad)), 4)
  }
});

const releaseAssessment = (assets) => {
  const byAsset = Object.fromEntries(assets.map((asset) => {
    const coldActivation = asset.summary.coldClickToReadyMs.max <= recommendedCiGates.releaseTargets.coldClickToReadyMs;
    const dragCadence = asset.summary.drag.minFramesPerSecond >= recommendedCiGates.releaseTargets.minDragFramesPerSecond;
    const dragLongTasks = asset.summary.drag.maxLongTaskCount <= recommendedCiGates.releaseTargets.maxDragLongTaskCount;
    return [asset.slug, {
      coldActivation: coldActivation ? "pass" : "fail",
      dragCadence: dragCadence ? "pass" : "fail",
      dragLongTasks: dragLongTasks ? "pass" : "fail"
    }];
  }));
  const emulationPass = Object.values(byAsset).every((checks) => Object.values(checks).every((value) => value === "pass"));
  return {
    status: emulationPass ? "emulation-pass-pending-physical-android" : "emulation-fail-pending-optimization-and-physical-android",
    byAsset,
    note: "The local static server does not apply production CDN compression; a physical Android run against release delivery remains mandatory."
  };
};

const labRegressionAssessment = (assets) => ({
  status: "diagnostic-only-not-a-default-ci-gate",
  byAsset: Object.fromEntries(assets.map((asset) => {
    const gate = recommendedCiGates.labRegressionCeilings[asset.slug];
    const samples = asset.samples.map((sample) => ({
      coldActivation: sample.coldClickToReadyMs <= gate.maxColdClickToReadyMs,
      transfer: sample.firstPartyTransferredBytes <= gate.maxFirstPartyTransferredBytes,
      visiblePixels: sample.visiblePixels >= gate.minVisiblePixels,
      activationLongTasks: sample.activationLongTasks.count <= gate.maxActivationLongTaskCount
        && sample.activationLongTasks.totalMs <= gate.maxActivationLongTaskTotalMs,
      touchCadence: sample.drag.framesPerSecond >= gate.minDragFramesPerSecond
        && sample.drag.p95FrameIntervalMs <= gate.maxDragP95FrameIntervalMs,
      touchLongTasks: sample.drag.longTasks.count <= gate.maxDragLongTaskCount
        && sample.drag.longTasks.totalMs <= gate.maxDragLongTaskTotalMs,
      orbitResponse: sample.drag.orbitDeltaRad >= gate.minOrbitDeltaRad
    }));
    return [asset.slug, {
      allSamplesWithinCalibration: samples.every((sample) => Object.values(sample).every(Boolean)),
      samples
    }];
  }))
});

const configureCdp = async (page) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: networkProfile.latencyMs,
    downloadThroughput: networkProfile.downloadBytesPerSecond,
    uploadThroughput: networkProfile.uploadBytesPerSecond,
    connectionType: networkProfile.connectionType
  });
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  return session;
};

const networkRecorder = (session) => {
  const records = new Map();
  let phase = "navigation";
  session.on("Network.requestWillBeSent", (event) => {
    records.set(event.requestId, {
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      resourceType: event.type,
      phase,
      encodedDataLength: 0,
      receivedDataLength: 0,
      status: null,
      completed: false,
      failed: false,
      canceled: false,
      errorText: null
    });
  });
  session.on("Network.responseReceived", (event) => {
    const record = records.get(event.requestId);
    if (record) record.status = event.response.status;
  });
  session.on("Network.loadingFinished", (event) => {
    const record = records.get(event.requestId);
    if (!record) return;
    record.encodedDataLength = Math.max(record.encodedDataLength, event.encodedDataLength);
    record.completed = true;
  });
  session.on("Network.dataReceived", (event) => {
    const record = records.get(event.requestId);
    if (!record) return;
    record.receivedDataLength += event.dataLength;
    record.encodedDataLength += event.encodedDataLength;
  });
  session.on("Network.loadingFailed", (event) => {
    const record = records.get(event.requestId);
    if (!record) return;
    record.failed = true;
    record.completed = true;
    record.canceled = event.canceled || false;
    record.errorText = event.errorText;
  });
  return {
    records,
    activate() { phase = "activation"; }
  };
};

const waitForActivationNetwork = async (records) => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const activation = [...records.values()].filter((record) => record.phase === "activation");
    if (activation.length && activation.every((record) => record.completed)) return { settled: true, pending: [] };
    await delay(50);
  }
  return {
    settled: false,
    pending: [...records.values()]
      .filter((record) => record.phase === "activation" && !record.completed)
      .map((record) => new URL(record.url).pathname)
  };
};

const installPerformanceObserver = (page) => page.addInitScript(() => {
  const state = {
    activationAt: null,
    readyAt: null,
    longTasks: [],
    longTaskSupported: PerformanceObserver.supportedEntryTypes.includes("longtask"),
    contextLosses: 0,
    contextLossEvents: []
  };
  window.__productViewerBenchmark = state;
  if (state.longTaskSupported) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: "longtask", buffered: true });
  }
  document.addEventListener("webglcontextlost", () => {
    state.contextLosses += 1;
    state.contextLossEvents.push(performance.now());
  }, true);
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-product-viewer-activate]");
    const root = button?.closest?.("[data-product-viewer]");
    if (!root || state.activationAt !== null) return;
    state.activationAt = performance.now();
    const observer = new MutationObserver(() => {
      if (root.dataset.viewerState !== "ready") return;
      state.readyAt = performance.now();
      observer.disconnect();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-viewer-state"] });
  }, true);
});

const visiblePixelEvidence = (page) => page.locator("model-viewer").evaluate(async (model) => {
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
  return { visiblePixels, capturePx: [canvas.width, canvas.height] };
});

const dragEvidence = async (page, session) => {
  const viewer = page.locator("model-viewer");
  await viewer.scrollIntoViewIfNeeded();
  const box = await viewer.boundingBox();
  assert.ok(box, "model-viewer must expose a pointer target");
  const start = { x: box.x + box.width * 0.39, y: box.y + box.height * 0.44 };
  const end = { x: box.x + box.width * 0.73, y: box.y + box.height * 0.54 };
  const hit = await viewer.evaluate((model, point) => {
    const target = model.shadowRoot?.elementFromPoint(point.x, point.y);
    return {
      id: target?.id || "",
      reachesUserInput: Boolean(model.shadowRoot?.querySelector(".userInput")?.contains(target))
    };
  }, start);
  assert.notEqual(hit.id, "default-pan-target", "benchmark drag must start away from the pan target");
  assert.equal(hit.reachesUserInput, true, "benchmark drag must reach model-viewer's real input surface");

  await viewer.evaluate((model) => {
    const orbit = model.getCameraOrbit();
    const state = window.__productViewerBenchmark;
    const drag = {
      active: true,
      startAt: performance.now(),
      endAt: null,
      frames: [],
      cameraSources: [],
      initialOrbit: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius }
    };
    const onCamera = (event) => drag.cameraSources.push(event.detail?.source || "unknown");
    model.addEventListener("camera-change", onCamera);
    drag.stop = () => model.removeEventListener("camera-change", onCamera);
    state.drag = drag;
    const frame = (time) => {
      if (!drag.active) return;
      drag.frames.push(time);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  const point = (x, y) => ({ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(start.x, start.y)] });
  const steps = 16;
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(start.x + (end.x - start.x) * progress, start.y + (end.y - start.y) * progress)]
    });
    await delay(24);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const input = await viewer.evaluate((model) => {
    const state = window.__productViewerBenchmark;
    const drag = state.drag;
    drag.active = false;
    drag.inputEndAt = performance.now();
    const orbit = model.getCameraOrbit();
    const longTasks = state.longTasks
      .filter((entry) => entry.startTime + entry.duration >= drag.startAt && entry.startTime <= drag.inputEndAt)
      .map((entry) => ({
        ...entry,
        overlapMs: Math.max(0, Math.min(entry.startTime + entry.duration, drag.inputEndAt) - Math.max(entry.startTime, drag.startAt))
      }));
    return {
      startAt: drag.startAt,
      endAt: drag.inputEndAt,
      frames: drag.frames,
      initialOrbit: drag.initialOrbit,
      finalOrbit: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius },
      longTasks
    };
  });
  await delay(500);
  const settled = await viewer.evaluate((model) => {
    const state = window.__productViewerBenchmark;
    const drag = state.drag;
    drag.stop();
    const endAt = performance.now();
    const orbit = model.getCameraOrbit();
    const longTasks = state.longTasks
      .filter((entry) => entry.startTime + entry.duration >= drag.inputEndAt && entry.startTime <= endAt)
      .map((entry) => ({
        ...entry,
        overlapMs: Math.max(0, Math.min(entry.startTime + entry.duration, endAt) - Math.max(entry.startTime, drag.inputEndAt))
      }));
    return {
      endAt,
      finalOrbit: { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius },
      cameraSources: drag.cameraSources,
      longTasks
    };
  });
  const intervals = input.frames.slice(1).map((time, index) => time - input.frames[index]).filter((value) => value > 0);
  const frameSpan = input.frames.at(-1) - input.frames[0];
  return {
    input: "CDP Input.dispatchTouchEvent",
    cadenceWindow: "touch-start-to-touch-end main-thread requestAnimationFrame cadence",
    startFraction: [0.39, 0.44],
    endFraction: [0.73, 0.54],
    inputSurface: hit,
    durationMs: round(input.endAt - input.startAt),
    frames: input.frames.length,
    framesPerSecond: round(frameSpan > 0 ? (input.frames.length - 1) * 1000 / frameSpan : 0),
    medianFrameIntervalMs: round(median(intervals)),
    p95FrameIntervalMs: round(percentile(intervals, 95)),
    maxFrameIntervalMs: round(Math.max(...intervals)),
    intervalsOver50Ms: intervals.filter((value) => value > 50).length,
    orbitDeltaRad: round(Math.hypot(input.finalOrbit.theta - input.initialOrbit.theta, input.finalOrbit.phi - input.initialOrbit.phi), 4),
    cameraChangeSources: [...new Set(settled.cameraSources)],
    longTasks: {
      accounting: "interval-overlap clipped to active touch window",
      count: input.longTasks.length,
      totalMs: round(input.longTasks.reduce((sum, entry) => sum + entry.overlapMs, 0))
    },
    settle: {
      durationMs: round(settled.endAt - input.endAt),
      orbitDeltaRad: round(Math.hypot(settled.finalOrbit.theta - input.finalOrbit.theta, settled.finalOrbit.phi - input.finalOrbit.phi), 4),
      longTasks: {
        accounting: "interval-overlap clipped to post-touch settle window",
        count: settled.longTasks.length,
        totalMs: round(settled.longTasks.reduce((sum, entry) => sum + entry.overlapMs, 0))
      }
    }
  };
};

const runSample = async (asset, sampleIndex) => {
  const context = await browser.newContext(deviceProfile);
  const page = await context.newPage();
  const session = await configureCdp(page);
  const recorder = networkRecorder(session);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installPerformanceObserver(page);
  await page.goto(`${baseUrl}${asset.route}`, { waitUntil: "networkidle", timeout: 30_000 });
  const preactivationHeavyRequests = [...recorder.records.values()]
    .filter((record) => record.phase === "navigation" && heavyRequestPattern.test(record.url))
    .map((record) => new URL(record.url).pathname);
  const activationButton = page.locator("[data-product-viewer-activate]");
  assert.equal(await page.locator("[data-product-viewer-poster]").isVisible(), true);
  recorder.activate();
  await activationButton.click();
  await page.waitForFunction(() => document.querySelector("[data-product-viewer]")?.dataset.viewerState === "ready", null, { timeout: 30_000 });
  const networkSettlement = await waitForActivationNetwork(recorder.records);
  const timing = await page.evaluate(() => {
    const state = window.__productViewerBenchmark;
    const longTasks = state.longTasks
      .filter((entry) => entry.startTime + entry.duration >= state.activationAt && entry.startTime <= state.readyAt)
      .map((entry) => ({
        ...entry,
        overlapMs: Math.max(0, Math.min(entry.startTime + entry.duration, state.readyAt) - Math.max(entry.startTime, state.activationAt))
      }));
    return {
      coldClickToReadyMs: state.readyAt - state.activationAt,
      longTaskSupported: state.longTaskSupported,
      longTasks
    };
  });
  const pixels = await visiblePixelEvidence(page);
  const drag = await dragEvidence(page, session);
  const stability = await page.evaluate(() => ({
    contextLosses: window.__productViewerBenchmark.contextLosses,
    contextLossEvents: window.__productViewerBenchmark.contextLossEvents
  }));
  const activationRecords = [...recorder.records.values()].filter((record) => record.phase === "activation");
  const activationRequests = activationRecords.map((record) => ({
    path: new URL(record.url).pathname,
    resourceType: record.resourceType,
    status: record.status,
    transferredBytes: Math.round(record.encodedDataLength || 0),
    receivedBodyBytes: Math.round(record.receivedDataLength || 0),
    completed: record.completed,
    failed: record.failed,
    canceled: record.canceled,
    errorText: record.errorText
  }));
  const modelRecord = activationRecords.find((record) => new URL(record.url).pathname.endsWith(`/${asset.modelPath}`));
  const modelFullBodyReceived = Boolean(modelRecord && modelRecord.receivedDataLength >= asset.modelBytes);
  const acceptedFullBodyCancellation = Boolean(modelRecord?.failed
    && modelRecord.canceled
    && /ERR_ABORTED/i.test(modelRecord.errorText || "")
    && modelFullBodyReceived);
  const unexpectedIncompleteRequests = activationRecords
    .filter((record) => !record.completed || (record.failed && record !== modelRecord))
    .map((record) => new URL(record.url).pathname);
  const firstParty = activationRecords.filter((record) => new URL(record.url).origin === baseUrl);
  const result = {
    sample: sampleIndex,
    coldCache: true,
    preactivationHeavyRequests,
    coldClickToReadyMs: round(timing.coldClickToReadyMs),
    firstPartyTransferredBytes: Math.round(firstParty.reduce((sum, record) => sum + (record.encodedDataLength || 0), 0)),
    thirdPartyActivationRequests: activationRecords.filter((record) => new URL(record.url).origin !== baseUrl).map((record) => record.url),
    networkSettlement,
    modelTransfer: {
      path: modelRecord ? new URL(modelRecord.url).pathname : null,
      status: modelRecord?.status ?? null,
      expectedBytes: asset.modelBytes,
      receivedBodyBytes: Math.round(modelRecord?.receivedDataLength || 0),
      completed: modelRecord?.completed || false,
      fullBodyReceived: modelFullBodyReceived,
      acceptedFullBodyCancellation,
      failed: modelRecord?.failed || false,
      canceled: modelRecord?.canceled || false,
      errorText: modelRecord?.errorText || null
    },
    unexpectedIncompleteRequests,
    activationRequests,
    visiblePixels: pixels.visiblePixels,
    capturePx: pixels.capturePx,
    activationLongTasks: {
      supported: timing.longTaskSupported,
      accounting: "interval-overlap clipped to click-to-ready window",
      count: timing.longTasks.length,
      totalMs: round(timing.longTasks.reduce((sum, entry) => sum + entry.overlapMs, 0))
    },
    drag,
    contextLosses: stability.contextLosses,
    contextLossEvents: stability.contextLossEvents,
    consoleErrors,
    pageErrors
  };
  await context.close();
  return result;
};

const posterOnlyCheck = async (asset, preference = "default") => {
  const contextOptions = { ...deviceProfile };
  if (preference === "reducedMotion") contextOptions.reducedMotion = "reduce";
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  if (preference === "saveData") {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    });
  }
  const session = await configureCdp(page);
  const recorder = networkRecorder(session);
  await page.goto(`${baseUrl}${asset.route}`, { waitUntil: "networkidle", timeout: 30_000 });
  const result = {
    slug: asset.slug,
    preference,
    posterVisible: await page.locator("[data-product-viewer-poster]").isVisible(),
    activationAvailable: await page.locator("[data-product-viewer-activate]").isEnabled(),
    modelElements: await page.locator("model-viewer").count(),
    heavyRequests: [...recorder.records.values()].filter((record) => heavyRequestPattern.test(record.url)).map((record) => new URL(record.url).pathname)
  };
  await context.close();
  return result;
};

const runBenchmark = async () => {
  await execFile(process.execPath, [path.join(siteRoot, "tools/build.mjs")], { cwd: siteRoot });
  app = createStaticServer({ root: path.join(siteRoot, "dist"), cacheControl: "no-store" });
  baseUrl = await app.listen();
  browser = await chromium.launch({ headless: true });
  const assetCoverage = await Promise.all(coverage.map(async (asset) => ({
    ...asset,
    modelBytes: (await stat(path.join(siteRoot, asset.modelPath))).size
  })));
  const largestReviewedAsset = assetCoverage.reduce((largest, asset) => asset.modelBytes > largest.modelBytes ? asset : largest);
  const smallestReviewedFlatAsset = assetCoverage.find(({ slug }) => slug === "zine-booklet");
  assert.ok(smallestReviewedFlatAsset, "zine performance sentinel is missing");
  const apparelSentinel = assetCoverage.find(({ slug }) => slug === "cap");
  assert.ok(apparelSentinel, "cap apparel performance sentinel is missing");
  const sampled = [largestReviewedAsset, apparelSentinel, smallestReviewedFlatAsset]
    .filter((asset, index, assets) => assets.findIndex(({ slug }) => slug === asset.slug) === index);
  const preactivationChecks = [];
  for (const asset of coverage) preactivationChecks.push(await posterOnlyCheck(asset));
  const policyChecks = {
    reducedMotion: await posterOnlyCheck(coverage[1], "reducedMotion"),
    saveData: await posterOnlyCheck(coverage[1], "saveData")
  };
  const assets = [];
  for (const asset of sampled) {
    const modelBytes = (await stat(path.join(siteRoot, asset.modelPath))).size;
    const samples = [];
    for (let sampleIndex = 1; sampleIndex <= 3; sampleIndex += 1) samples.push(await runSample({ ...asset, modelBytes }, sampleIndex));
    assets.push({
      slug: asset.slug,
      assetKey: asset.assetKey,
      modelPath: asset.modelPath,
      modelBytes,
      sampleRole: asset.slug === largestReviewedAsset.slug
        ? "largest-reviewed-model"
        : asset.slug === apparelSentinel.slug
          ? "apparel-sentinel"
          : "smallest-reviewed-flat-model",
      samples,
      summary: summarize(samples)
    });
  }
  return {
    schemaVersion: 1,
    benchmark: "product-viewer-cold-mobile",
    generatedAtPolicy: "timestamp-omitted; raw timings are environment-specific",
    environment: {
      browser: `Chromium ${browser.version()}`,
      playwright: "1.61.1",
      node: process.version,
      platform: `${os.platform()} ${os.arch()} ${os.release()}`,
      viewportCssPx: [deviceProfile.viewport.width, deviceProfile.viewport.height],
      deviceScaleFactor: deviceProfile.deviceScaleFactor,
      mobile: deviceProfile.isMobile,
      touch: deviceProfile.hasTouch,
      coldCachePolicy: "new incognito context per sample plus CDP cache disabled",
      executionPolicy: "serial isolated run; use PVKH_VIEWER_BENCHMARK_OUTPUT to prevent report collisions",
      emulation: { network: networkProfile, cpuSlowdownMultiplier: 4 },
      caveat: "Chromium CDP emulation is reproducible lab evidence, not a substitute for a physical Android device run."
    },
    assetCoverage,
    preactivationChecks,
    policyChecks,
    assets,
    recommendedCiGates,
    labRegressionAssessment: labRegressionAssessment(assets),
    releaseAssessment: releaseAssessment(assets)
  };
};

before(async () => {
  benchmarkReport = await runBenchmark();
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(benchmarkReport, null, 2)}\n`);
}, { timeout: 240_000 });

after(async () => {
  await browser?.close();
  await app?.close();
});

const assertReportShape = (report) => {
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.benchmark, "product-viewer-cold-mobile");
  assert.deepEqual(report.environment.viewportCssPx, [393, 851]);
  assert.equal(report.environment.deviceScaleFactor, 2.75);
  assert.equal(report.environment.mobile, true);
  assert.equal(report.environment.touch, true);
  assert.equal(report.environment.emulation.network.label, "CDP Fast 4G");
  assert.equal(report.environment.emulation.cpuSlowdownMultiplier, 4);
  assert.match(report.environment.caveat, /emulation.*physical Android/i);
  assert.deepEqual(Object.keys(report.policyChecks).sort(), ["reducedMotion", "saveData"]);
  assert.equal(report.assetCoverage.length, 5);
  assert.equal(report.preactivationChecks.length, 5);
  assert.equal(report.assets.length, 3);

  for (const asset of report.assets) {
    const largest = report.assetCoverage.reduce((current, candidate) => candidate.modelBytes > current.modelBytes ? candidate : current);
    assert.ok([largest.slug, "cap", "zine-booklet"].includes(asset.slug));
    assert.equal(asset.samples.length >= 3, true);
    assert.ok(finite(asset.modelBytes) && asset.modelBytes > 0);
    for (const sample of asset.samples) {
      assert.ok(finite(sample.coldClickToReadyMs) && sample.coldClickToReadyMs > 0);
      assert.ok(finite(sample.firstPartyTransferredBytes) && sample.firstPartyTransferredBytes > 0);
      assert.ok(finite(sample.visiblePixels) && sample.visiblePixels > 0);
      assert.ok(finite(sample.activationLongTasks.count) && sample.activationLongTasks.count >= 0);
      assert.ok(finite(sample.activationLongTasks.totalMs) && sample.activationLongTasks.totalMs >= 0);
      assert.ok(finite(sample.drag.frames) && sample.drag.frames > 0);
      assert.ok(finite(sample.drag.medianFrameIntervalMs) && sample.drag.medianFrameIntervalMs > 0);
      assert.ok(finite(sample.drag.p95FrameIntervalMs) && sample.drag.p95FrameIntervalMs > 0);
      assert.ok(finite(sample.drag.orbitDeltaRad) && sample.drag.orbitDeltaRad > 0);
      assert.ok(Array.isArray(sample.activationRequests));
      assert.ok(Array.isArray(sample.contextLossEvents));
      assert.equal(typeof sample.networkSettlement?.settled, "boolean");
      assert.equal(typeof sample.modelTransfer?.fullBodyReceived, "boolean");
    }
  }

  assert.ok(report.recommendedCiGates && typeof report.recommendedCiGates === "object");
  assert.equal(report.recommendedCiGates.defaultCiGate, false);
  assert.match(report.recommendedCiGates.executionPolicy, /opt-in.*isolated.*serial.*excluded from default CI/i);
  assert.equal(report.recommendedCiGates.releaseTargets.physicalAndroidRequired, true);
  assert.match(report.recommendedCiGates.calibration, /regression.*not release acceptance/i);
  assert.equal(report.labRegressionAssessment.status, "diagnostic-only-not-a-default-ci-gate");
  assert.match(report.releaseAssessment.status, /^emulation-(?:pass|fail)-pending-/);
};

test("emits the governed mobile viewer performance evidence schema", async () => {
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assertReportShape(report);
});

test("keeps every reviewed route and constrained preference poster-only before activation", () => {
  for (const entry of [...benchmarkReport.preactivationChecks, ...Object.values(benchmarkReport.policyChecks)]) {
    assert.equal(entry.posterVisible, true, `${entry.slug}/${entry.preference} lost its poster`);
    assert.equal(entry.activationAvailable, true, `${entry.slug}/${entry.preference} lost explicit activation`);
    assert.equal(entry.modelElements, 0, `${entry.slug}/${entry.preference} instantiated model-viewer eagerly`);
    assert.deepEqual(entry.heavyRequests, [], `${entry.slug}/${entry.preference} fetched heavy viewer assets eagerly`);
  }
});

test("records real cold activation, pixels, long tasks and off-centre orbit interaction", () => {
  for (const asset of benchmarkReport.assets) {
    for (const sample of asset.samples) {
      assert.deepEqual(sample.preactivationHeavyRequests, []);
      assert.deepEqual(sample.thirdPartyActivationRequests, []);
      assert.equal(sample.activationLongTasks.supported, true);
      assert.equal(sample.contextLosses, 0);
      assert.deepEqual(sample.contextLossEvents, []);
      assert.deepEqual(sample.consoleErrors, []);
      assert.deepEqual(sample.pageErrors, []);
      assert.equal(sample.networkSettlement.settled, true);
      assert.deepEqual(sample.networkSettlement.pending, []);
      assert.equal(sample.modelTransfer.path, `/${asset.modelPath}`);
      assert.equal(sample.modelTransfer.status, 200);
      assert.equal(sample.modelTransfer.completed, true);
      assert.equal(sample.modelTransfer.fullBodyReceived, true);
      assert.ok(!sample.modelTransfer.failed || sample.modelTransfer.acceptedFullBodyCancellation);
      assert.deepEqual(sample.unexpectedIncompleteRequests, []);
      assert.ok(sample.visiblePixels > 0);
      assert.ok(sample.firstPartyTransferredBytes >= asset.modelBytes);
      assert.equal(sample.activationLongTasks.accounting, "interval-overlap clipped to click-to-ready window");
      assert.equal(sample.drag.inputSurface.reachesUserInput, true);
      assert.notEqual(sample.drag.inputSurface.id, "default-pan-target");
      assert.equal(sample.drag.cadenceWindow, "touch-start-to-touch-end main-thread requestAnimationFrame cadence");
      assert.ok(sample.drag.cameraChangeSources.includes("user-interaction"));
      assert.ok(sample.drag.orbitDeltaRad > 0.03);
      assert.ok(sample.drag.frames >= 10);
      assert.equal(sample.drag.longTasks.accounting, "interval-overlap clipped to active touch window");
      assert.equal(sample.drag.settle.longTasks.accounting, "interval-overlap clipped to post-touch settle window");
    }
  }
});

test("records host-specific lab comparisons without weakening the physical-device release target", () => {
  assert.equal(benchmarkReport.recommendedCiGates.releaseTargets.coldClickToReadyMs, 2_500);
  assert.equal(benchmarkReport.recommendedCiGates.releaseTargets.minDragFramesPerSecond, 50);
  assert.equal(benchmarkReport.recommendedCiGates.releaseTargets.maxDragLongTaskCount, 0);
  assert.equal(benchmarkReport.recommendedCiGates.releaseTargets.physicalAndroidRequired, true);
  assert.equal(benchmarkReport.recommendedCiGates.defaultCiGate, false);
  assert.equal(benchmarkReport.labRegressionAssessment.status, "diagnostic-only-not-a-default-ci-gate");
  for (const asset of benchmarkReport.assets) {
    const gate = benchmarkReport.recommendedCiGates.labRegressionCeilings[asset.slug];
    assert.ok(gate, `${asset.slug} has no calibrated lab regression gate`);
    assert.equal(asset.samples.length, benchmarkReport.recommendedCiGates.samplesPerAsset);
    assert.equal(benchmarkReport.labRegressionAssessment.byAsset[asset.slug].samples.length, asset.samples.length);
    assert.equal(typeof benchmarkReport.labRegressionAssessment.byAsset[asset.slug].allSamplesWithinCalibration, "boolean");
  }
});

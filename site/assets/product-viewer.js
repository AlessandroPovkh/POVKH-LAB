let runtimePromise = null;

const connection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const localUrl = (value, label, base = document.baseURI) => {
  const url = new URL(value, base);
  if (url.origin !== location.origin) throw new Error(`${label} must remain first-party`);
  return url.href;
};

const supportsWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};

const decoderLocationsFor = (runtimeUrl) => ({
  dracoDecoderLocation: new URL("model-viewer-support/draco/", runtimeUrl).href,
  ktx2TranscoderLocation: new URL("model-viewer-support/basis/", runtimeUrl).href,
  meshoptDecoderLocation: null,
  lottieLoaderLocation: new URL("model-viewer-support/lottie-loader.disabled.js", runtimeUrl).href
});

const loadRuntime = async (runtimeValue) => {
  const runtimeUrl = localUrl(runtimeValue, "model-viewer runtime");
  const locations = decoderLocationsFor(runtimeUrl);
  const preset = globalThis.ModelViewerElement || {};
  Object.assign(preset, locations);
  globalThis.ModelViewerElement = preset;

  if (!runtimePromise) {
    runtimePromise = import(runtimeUrl).then(async () => {
      await customElements.whenDefined("model-viewer");
      return customElements.get("model-viewer");
    }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  const ModelViewer = await runtimePromise;
  const { meshoptDecoderLocation: unusedMeshoptLocation, ...lazyLocations } = locations;
  Object.assign(ModelViewer, lazyLocations);
  return ModelViewer;
};

const stateCopy = (root, key, fallback) => root.dataset[key] || fallback;

const elementsFor = (root) => {
  const elements = {
    canvas: root.querySelector("[data-product-viewer-canvas]"),
    poster: root.querySelector("[data-product-viewer-poster]"),
    activate: root.querySelector("[data-product-viewer-activate]"),
    reset: root.querySelector("[data-product-viewer-reset]"),
    status: root.querySelector("[data-product-viewer-status]"),
    instructions: root.querySelector("[data-product-viewer-instructions]")
  };
  if (Object.values(elements).some((element) => !element)) throw new Error("Product viewer markup is incomplete");
  return elements;
};

const showFailure = (root, { poster, activate, reset, status, instructions }) => {
  root.dataset.viewerState = "error";
  root.setAttribute("aria-busy", "false");
  root.classList.remove("is-viewer-ready");
  root.classList.remove("product-viewer--active");
  poster.hidden = false;
  activate.hidden = false;
  activate.disabled = root.dataset.viewerAvailability === "sourceBlocked";
  reset.hidden = true;
  instructions.hidden = true;
  status.textContent = stateCopy(root, "viewerError", "3D view unavailable");
};

const showReady = (root, { poster, activate, reset, status, instructions }) => {
  root.dataset.viewerState = "ready";
  root.setAttribute("aria-busy", "false");
  root.classList.add("is-viewer-ready");
  poster.hidden = true;
  activate.hidden = true;
  reset.hidden = false;
  instructions.hidden = false;
  status.textContent = stateCopy(root, "viewerReady", "Interactive view ready");
};

const hasRenderableBounds = (model) => {
  try {
    const dimensions = model.getDimensions();
    const center = model.getBoundingBoxCenter();
    const dimensionValues = [dimensions.x, dimensions.y, dimensions.z];
    const centerValues = [center.x, center.y, center.z];
    return dimensionValues.every((value) => Number.isFinite(value) && value > 0)
      && centerValues.every(Number.isFinite);
  } catch {
    return false;
  }
};

const cameraProfileFor = (root, mobile) => ({
  orbit: root.dataset[mobile ? "viewerOrbitMobile" : "viewerOrbitDesktop"] || "0deg 75deg 105%",
  fieldOfView: root.dataset[mobile ? "viewerFieldOfViewMobile" : "viewerFieldOfViewDesktop"] || "auto",
  target: root.dataset[mobile ? "viewerCameraTargetMobile" : "viewerCameraTargetDesktop"] || "auto auto auto"
});

const waitForImage = (image) => new Promise((resolve, reject) => {
  if (image.complete && image.naturalWidth) return resolve();
  image.addEventListener("load", resolve, { once: true });
  image.addEventListener("error", reject, { once: true });
});

const activateSpin = async (root, elements, routeSignal) => {
  const controller = new AbortController();
  const { signal } = controller;
  const dispose = () => {
    if (signal.aborted) return;
    controller.abort();
    elements.canvas.replaceChildren();
  };
  routeSignal?.addEventListener("abort", dispose, { once: true });

  try {
    const manifestUrl = localUrl(root.dataset.viewerSrc, "spin manifest");
    const response = await fetch(manifestUrl, { credentials: "same-origin", signal });
    if (!response.ok) throw new Error(`Spin manifest failed with ${response.status}`);
    const manifest = await response.json();
    const variant = window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop";
    const frames = manifest?.variants?.[variant]?.frames;
    if (manifest?.schemaVersion !== 1 || !Array.isArray(frames) || frames.length < 2) {
      throw new Error("Spin manifest is invalid");
    }
    const frameUrls = frames.map((frame) => localUrl(frame, "spin frame", manifestUrl));
    const image = document.createElement("img");
    image.className = "product-viewer-spin";
    image.dataset.productViewerSpin = "";
    image.dataset.frameIndex = "0";
    image.tabIndex = 0;
    image.alt = elements.poster.alt;
    image.setAttribute("aria-describedby", elements.instructions.id);
    image.draggable = false;
    image.src = frameUrls[0];
    elements.canvas.replaceChildren(image);
    elements.canvas.removeAttribute("aria-hidden");
    await waitForImage(image);
    if (signal.aborted || !root.isConnected) return { dispose };

    let frameIndex = 0;
    let pointerStart = null;
    const showFrame = (next) => {
      frameIndex = (next + frameUrls.length) % frameUrls.length;
      image.dataset.frameIndex = String(frameIndex);
      image.src = frameUrls[frameIndex];
    };
    image.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") showFrame(frameIndex + 1);
      else if (event.key === "ArrowLeft") showFrame(frameIndex - 1);
      else if (event.key === "Home") showFrame(0);
      else return;
      event.preventDefault();
    }, { signal });
    image.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      pointerStart = { x: event.clientX, index: frameIndex };
      try { image.setPointerCapture(event.pointerId); } catch { /* synthetic pointer events */ }
    }, { signal });
    image.addEventListener("pointermove", (event) => {
      if (!pointerStart) return;
      const steps = Math.trunc((pointerStart.x - event.clientX) / 40);
      showFrame(pointerStart.index + steps);
    }, { signal });
    const endPointer = (event) => {
      pointerStart = null;
      try { image.releasePointerCapture(event.pointerId); } catch { /* synthetic pointer events */ }
    };
    image.addEventListener("pointerup", endPointer, { signal });
    image.addEventListener("pointercancel", endPointer, { signal });
    elements.reset.addEventListener("click", () => {
      showFrame(0);
      image.focus({ preventScroll: true });
    }, { signal });

    showReady(root, elements);
    image.focus({ preventScroll: true });
    return { dispose };
  } catch (error) {
    if (!signal.aborted) showFailure(root, elements);
    dispose();
    return null;
  }
};

const activateModel = async (root, elements, routeSignal) => {
  if (!supportsWebGL()) {
    showFailure(root, elements);
    return null;
  }
  if (connection()?.saveData === true) {
    elements.status.textContent = stateCopy(root, "viewerDataSaver", "Data Saver is active");
  }
  await loadRuntime(root.dataset.viewerRuntime);
  if (routeSignal?.aborted || !root.isConnected) return null;

  const controller = new AbortController();
  const { signal } = controller;
  const model = document.createElement("model-viewer");
  const mobileCamera = window.matchMedia("(max-width: 640px)");
  let userAdjustedOrbit = false;
  let applyingCameraProfile = false;
  let cameraProfileRevision = 0;
  const applyCameraProfile = ({ preserveUserOrbit = false, jump = true } = {}) => {
    const preservedOrbit = preserveUserOrbit ? model.getCameraOrbit?.() : null;
    const profile = cameraProfileFor(root, mobileCamera.matches);
    model.setAttribute("field-of-view", profile.fieldOfView);
    model.setAttribute("camera-target", profile.target);
    if (preservedOrbit
      && [preservedOrbit.theta, preservedOrbit.phi, preservedOrbit.radius].every(Number.isFinite)) {
      model.setAttribute("camera-orbit", preservedOrbit.toString());
    } else {
      model.setAttribute("camera-orbit", profile.orbit);
    }
    if (jump) model.jumpCameraToGoal?.();
  };
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const settleCameraProfile = async ({ preserveUserOrbit = false } = {}) => {
    const revision = ++cameraProfileRevision;
    await nextFrame();
    await nextFrame();
    if (signal.aborted || !model.isConnected || revision !== cameraProfileRevision) return;

    applyingCameraProfile = true;
    applyCameraProfile({ preserveUserOrbit });
    await model.updateComplete;
    model.jumpCameraToGoal?.();
    await model.updateComplete;
    await nextFrame();
    if (signal.aborted || !model.isConnected || revision !== cameraProfileRevision) {
      applyingCameraProfile = false;
      return;
    }

    applyingCameraProfile = false;
  };
  model.className = "product-viewer-model";
  model.setAttribute("camera-controls", "");
  model.setAttribute("touch-action", "pan-y");
  model.setAttribute("interaction-prompt", "none");
  model.setAttribute("loading", "eager");
  model.setAttribute("reveal", "auto");
  model.setAttribute("shadow-intensity", "0.55");
  model.setAttribute("shadow-softness", "1");
  model.setAttribute("exposure", "1.05");
  applyCameraProfile({ jump: false });
  model.setAttribute("alt", elements.poster.alt);
  model.setAttribute("aria-describedby", elements.instructions.id);
  model.a11y = { "interaction-prompt": elements.instructions.textContent.trim() };
  if (reducedMotion()) model.setAttribute("data-reduced-motion", "true");
  elements.canvas.replaceChildren(model);
  elements.canvas.removeAttribute("aria-hidden");

  const fail = () => {
    if (signal.aborted) return;
    showFailure(root, elements);
    model.removeAttribute("src");
    model.remove();
    controller.abort();
  };

  model.addEventListener("progress", (event) => {
    if (signal.aborted || root.dataset.viewerState === "ready") return;
    const progress = Number(event.detail?.totalProgress);
    const suffix = Number.isFinite(progress) ? ` ${Math.round(progress * 100)}%` : "";
    elements.status.textContent = `${stateCopy(root, "viewerLoading", "Loading object")}${suffix}`;
  }, { signal });
  model.addEventListener("load", async () => {
    if (signal.aborted) return;
    if (!hasRenderableBounds(model)) {
      fail();
      return;
    }
    await settleCameraProfile();
    if (signal.aborted || !model.isConnected) return;
    showReady(root, elements);
    const input = model.shadowRoot?.querySelector(".userInput");
    input?.setAttribute("aria-describedby", elements.instructions.id);
    elements.reset.scrollIntoView({ block: "center", inline: "nearest" });
    elements.reset.focus({ preventScroll: true });
  }, { signal });
  model.addEventListener("error", fail, { signal });
  model.addEventListener("camera-change", (event) => {
    if (!applyingCameraProfile && event.detail?.source === "user-interaction") userAdjustedOrbit = true;
  }, { signal });
  mobileCamera.addEventListener("change", () => {
    settleCameraProfile({ preserveUserOrbit: userAdjustedOrbit });
  }, { signal });
  elements.reset.addEventListener("click", () => {
    userAdjustedOrbit = false;
    settleCameraProfile();
    (model.shadowRoot?.querySelector(".userInput") || model).focus({ preventScroll: true });
  }, { signal });

  const dispose = () => {
    if (signal.aborted) return;
    controller.abort();
    model.removeAttribute("src");
    model.remove();
  };
  routeSignal?.addEventListener("abort", dispose, { once: true });
  model.setAttribute("src", localUrl(root.dataset.viewerSrc, "product model"));
  return { dispose };
};

export const activateProductViewer = async (root, { signal: routeSignal } = {}) => {
  if (!(root instanceof HTMLElement)) throw new TypeError("A product viewer root is required");
  const elements = elementsFor(root);
  elements.status.setAttribute("aria-live", "polite");
  elements.status.setAttribute("aria-atomic", "true");
  if (routeSignal?.aborted) return null;
  if (root.dataset.viewerAvailability === "sourceBlocked") {
    showFailure(root, elements);
    return null;
  }

  root.dataset.viewerState = "loading";
  root.classList.add("product-viewer--active");
  root.setAttribute("aria-busy", "true");
  elements.status.textContent = stateCopy(root, "viewerLoading", "Loading object");
  if (root.dataset.viewerKind === "spin") return activateSpin(root, elements, routeSignal);
  return activateModel(root, elements, routeSignal);
};

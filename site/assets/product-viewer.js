let runtimePromise = null;

const connection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const localUrl = (value, label) => {
  const url = new URL(value, document.baseURI);
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

const loadRuntime = async (runtimeUrl) => {
  if (!runtimePromise) {
    runtimePromise = import(localUrl(runtimeUrl, "model-viewer runtime")).then(async () => {
      await customElements.whenDefined("model-viewer");
    }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
};

const stateCopy = (root, key, fallback) => root.dataset[key] || fallback;

export const activateProductViewer = async (root, { signal: routeSignal } = {}) => {
  if (!(root instanceof HTMLElement)) throw new TypeError("A product viewer root is required");
  const canvas = root.querySelector("[data-product-viewer-canvas]");
  const poster = root.querySelector("[data-product-viewer-poster]");
  const activate = root.querySelector("[data-product-viewer-activate]");
  const reset = root.querySelector("[data-product-viewer-reset]");
  const status = root.querySelector("[data-product-viewer-status]");
  const instructions = root.querySelector("[data-product-viewer-instructions]");
  if (!canvas || !poster || !activate || !reset || !status || !instructions) {
    throw new Error("Product viewer markup is incomplete");
  }

  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  if (routeSignal?.aborted) return null;
  if (!supportsWebGL()) throw new Error("WebGL is unavailable");

  const saver = connection()?.saveData === true;
  if (saver) status.textContent = stateCopy(root, "viewerDataSaver", "Data Saver is active");
  await loadRuntime(root.dataset.viewerRuntime);
  if (routeSignal?.aborted || !root.isConnected) return null;

  const controller = new AbortController();
  const { signal } = controller;
  const model = document.createElement("model-viewer");
  const initialOrbit = root.dataset.viewerOrbit || "0deg 75deg 105%";
  model.className = "product-viewer-model";
  model.setAttribute("camera-controls", "");
  model.setAttribute("tabindex", "0");
  model.setAttribute("touch-action", "pan-y");
  model.setAttribute("interaction-prompt", "none");
  model.setAttribute("loading", "eager");
  model.setAttribute("reveal", "auto");
  model.setAttribute("shadow-intensity", "0.7");
  model.setAttribute("shadow-softness", "0.85");
  model.setAttribute("exposure", "0.9");
  model.setAttribute("camera-orbit", initialOrbit);
  model.setAttribute("alt", poster.alt);
  if (reducedMotion()) model.setAttribute("data-reduced-motion", "true");
  canvas.replaceChildren(model);
  canvas.removeAttribute("aria-hidden");

  const fail = () => {
    root.dataset.viewerState = "error";
    root.setAttribute("aria-busy", "false");
    root.classList.remove("is-viewer-ready");
    poster.hidden = false;
    activate.hidden = false;
    activate.disabled = false;
    reset.hidden = true;
    instructions.hidden = true;
    status.textContent = stateCopy(root, "viewerError", "3D view unavailable");
    model.removeAttribute("src");
    model.remove();
    controller.abort();
  };

  model.addEventListener("progress", (event) => {
    if (signal.aborted) return;
    const progress = Number(event.detail?.totalProgress);
    const suffix = Number.isFinite(progress) ? ` ${Math.round(progress * 100)}%` : "";
    status.textContent = `${stateCopy(root, "viewerLoading", "Loading object")}${suffix}`;
  }, { signal });
  model.addEventListener("load", () => {
    if (signal.aborted) return;
    root.dataset.viewerState = "ready";
    root.setAttribute("aria-busy", "false");
    root.classList.add("is-viewer-ready");
    poster.hidden = true;
    activate.hidden = true;
    reset.hidden = false;
    instructions.hidden = false;
    status.textContent = stateCopy(root, "viewerReady", "3D view ready");
  }, { signal });
  model.addEventListener("error", fail, { signal });
  reset.addEventListener("click", () => {
    model.cameraOrbit = initialOrbit;
    model.fieldOfView = "auto";
    model.jumpCameraToGoal?.();
    model.focus({ preventScroll: true });
  }, { signal });

  const dispose = () => {
    if (signal.aborted) return;
    controller.abort();
    model.removeAttribute("src");
    model.remove();
  };
  routeSignal?.addEventListener("abort", dispose, { once: true });

  root.dataset.viewerState = "loading";
  root.setAttribute("aria-busy", "true");
  status.textContent = stateCopy(root, "viewerLoading", "Loading object");
  model.setAttribute("src", localUrl(root.dataset.viewerSrc, "product model"));
  return { dispose };
};

(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const duration = 3;
  const fixedTime = params.has("time") ? Number(params.get("time")) : null;
  const stage = document.getElementById("stage");
  const noise = document.getElementById("physical-noise");
  const displacement = document.getElementById("physical-displacement");
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const range = (time, start, end) => clamp((time - start) / (end - start));
  const ease = (value) => 1 - Math.pow(1 - clamp(value), 3);
  const fade = (time) => 1 - ease(range(time, 2.72, 2.98));
  const set = (name, value) => stage.style.setProperty(name, value);

  function update(rawTime) {
    const time = ((rawTime % duration) + duration) % duration;
    const phase = (time / duration) * Math.PI * 2;
    const release = fade(time);
    const scanIn = ease(range(time, 0.02, 0.18));
    const scanOut = 1 - ease(range(time, 0.54, 0.72));
    const register = ease(range(time, 0.18, 0.86)) * release;
    const materialise = ease(range(time, 0.5, 1.32)) * release;
    const hold = ease(range(time, 1.18, 1.58)) * release;

    set("--scan-opacity", String(scanIn * scanOut));
    set("--scan-x", `${ease(range(time, 0.04, 0.64)) * 1766}px`);
    set("--register-opacity", String(register * 0.9));
    set("--ring-offset", String(1750 * (1 - register)));
    set("--register-x", `${Math.sin(phase * 2) * 7}px`);
    set("--register-y", `${Math.cos(phase) * 5}px`);
    set("--materialise", String(materialise));
    set("--word-opacity", String(materialise));
    set("--word-clip", `${(1 - materialise) * 100}%`);
    set("--echo-x", `${-18 + (Math.sin(phase * 3) * 20)}px`);
    set("--echo-y", `${8 + (Math.cos(phase * 2) * 9)}px`);
    set("--slice-opacity", String(materialise * (0.42 + Math.abs(Math.sin(phase * 2)) * 0.42)));
    set("--slice-a-x", `${Math.sin(phase * 2.4) * 52}px`);
    set("--slice-b-x", `${Math.cos(phase * 1.6) * -68}px`);
    set("--slice-c-x", `${Math.sin(phase * 3.1) * 39}px`);
    set("--datum-opacity", String(register));
    set("--shard-opacity", String(materialise * 0.72));
    set("--shard-y", `${Math.sin(phase * 1.5) * 22}px`);
    set("--hold", String(hold));
    set("--meta-opacity", String(ease(range(time, 0.82, 1.24)) * release));
    set("--mark-opacity", String(ease(range(time, 0.92, 1.32)) * release));
    set("--contour-x", `${Math.sin(phase) * 42}px`);
    noise.setAttribute("baseFrequency", `${(0.006 + ((1 - hold) * 0.004)).toFixed(4)} ${(0.028 + (Math.sin(phase) * 0.006)).toFixed(4)}`);
    displacement.setAttribute("scale", String(18 + ((1 - hold) * 58)));
  }

  const ready = async () => {
    await document.fonts.ready;
    const mark = document.querySelector(".physical-mark");
    if (mark && !mark.complete) await new Promise((resolve) => mark.addEventListener("load", resolve, { once: true }));
    if (fixedTime !== null && Number.isFinite(fixedTime)) {
      update(fixedTime);
    } else if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const started = performance.now();
      const tick = (now) => {
        update((now - started) / 1000);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      update(1.75);
    }
    window.__POVKH_PHYSICAL_READY__ = true;
  };

  ready();
})();

(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const scene = params.get("scene") || "ident";
  const fixedTime = params.has("time") ? Number(params.get("time")) : null;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stage = document.getElementById("stage");
  const blobWords = new Set(["PVKH", "SOUND.", "PROCESS.", "ARCHIVE.", "TEAM", "ORIGIN", "SIGNAL", "LINK", "PRIME"]);
  const blobWord = blobWords.has(params.get("word")) ? params.get("word") : "PVKH";
  const blobAccent = /^#[0-9a-f]{6}$/i.test(params.get("accent") || "") ? params.get("accent") : "#f32222";
  stage.style.setProperty("--motion-accent", blobAccent);
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const range = (time, start, end) => clamp((time - start) / (end - start));
  const ease = value => 1 - Math.pow(1 - clamp(value), 3);
  const out = (time, start, end) => 1 - ease(range(time, start, end));
  const set = (name, value) => stage.style.setProperty(name, value);
  const logo = (className, src = "../../../assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg", critical = true) =>
    `<img class="logo ${className}" src="${src}" alt="" aria-hidden="true" ${critical ? 'data-critical="true"' : ""}>`;

  const scenes = {
    ident: {
      duration: 4,
      label: "Four-second POVKH LAB logo ident",
      html: `<div class="layer void-bg"></div><div class="layer signal-bg ident-pressure"></div>${logo("ident-logo")}<div class="layer signal-bg ident-scan"></div><div class="meta ident-index" data-critical="true">POVKH LAB / ID-01 / 04.00</div>`,
      update(time) {
        const reveal = ease(range(time, .34, .82));
        const release = out(time, 3.48, 3.96);
        set("--pressure-x", String(ease(range(time, .08, .34)) * out(time, .52, .76)));
        set("--ident-clip", `${(1 - reveal) * 100}%`);
        set("--ident-opacity", String(reveal * release));
        set("--scan-y", `${72 + range(time, .76, 1.28) * 856}px`);
        set("--scan-opacity", String(out(time, 1.16, 1.34) * range(time, .72, .78)));
        set("--index-opacity", String(ease(range(time, .92, 1.18)) * release));
      },
    },
    transition: {
      duration: 1,
      label: "One-second signal line transition",
      html: `<div class="layer void-bg"></div><div class="layer bone-bg transition-bone"></div><div class="layer signal-bg transition-red"></div><div class="layer transition-cut"></div>`,
      update(time) {
        const first = ease(range(time, .02, .56));
        const second = ease(range(time, .26, .84));
        set("--wipe-bone", `${-100 + first * 200}%`);
        set("--wipe-red", `${-110 + second * 820}%`);
        set("--cut-opacity", String(out(time, .58, .82) * range(time, .42, .50)));
      },
    },
    loop: {
      duration: 4,
      label: "Four-second archival index background loop",
      html: `<div class="layer void-bg"></div><div class="display loop-index" aria-hidden="true">001</div><div class="loop-line-a"></div><div class="loop-line-b"></div><div class="loop-signal"></div><div class="meta loop-meta" data-critical="true">PVKH-001 / SIGNAL FIELD / LOOP 04.00</div>${logo("loop-mark", "../../../assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg", true)}`,
      update(time) {
        const phase = (time / 4) * Math.PI * 2;
        set("--loop-x", `${Math.sin(phase) * 30}px`);
        set("--loop-y", `${Math.cos(phase) * 18}px`);
        set("--loop-signal-x", `${72 + (1 - Math.cos(phase)) * 860}px`);
      },
    },
    "blob-loop": {
      duration: 3,
      label: "Three-second sharp digital PVKH blob background loop",
      html: `<div class="layer void-bg"></div>
        <svg class="blob-field" viewBox="0 0 1920 1080" aria-hidden="true">
          <defs>
            <filter id="blob-displace" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB">
              <feTurbulence class="blob-noise" type="turbulence" baseFrequency=".009 .034" numOctaves="1" seed="19" result="noise"/>
              <feDisplacementMap class="blob-displacement" in="SourceGraphic" in2="noise" scale="44" xChannelSelector="R" yChannelSelector="B"/>
            </filter>
            <filter id="blob-goo" x="-20%" y="-30%" width="140%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="11" result="blur"/>
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 34 -14"/>
            </filter>
            <clipPath id="slice-a"><rect x="300" y="265" width="1320" height="108"/></clipPath>
            <clipPath id="slice-b"><rect x="300" y="490" width="1320" height="74"/></clipPath>
            <clipPath id="slice-c"><rect x="300" y="675" width="1320" height="126"/></clipPath>
          </defs>
          <line class="blob-grid-line" x1="72" y1="218" x2="1848" y2="218"/>
          <line class="blob-grid-line" x1="72" y1="862" x2="1848" y2="862"/>
          <g class="blob-echo-group" filter="url(#blob-goo)">
            <text class="blob-word blob-echo" x="960" y="735" textLength="1320" lengthAdjust="spacingAndGlyphs">${blobWord}</text>
            <circle class="blob-orb signal blob-orb-a" cx="380" cy="520" r="88"/>
            <circle class="blob-orb signal blob-orb-b" cx="1540" cy="640" r="72"/>
          </g>
          <g class="blob-main-group" filter="url(#blob-displace)"><text class="blob-word" x="960" y="716" textLength="1320" lengthAdjust="spacingAndGlyphs">${blobWord}</text></g>
          <text class="blob-word blob-slice blob-slice-a" x="960" y="716" textLength="1320" lengthAdjust="spacingAndGlyphs" clip-path="url(#slice-a)">${blobWord}</text>
          <text class="blob-word blob-slice blob-slice-b" x="960" y="716" textLength="1320" lengthAdjust="spacingAndGlyphs" clip-path="url(#slice-b)">${blobWord}</text>
          <text class="blob-word blob-slice blob-slice-c" x="960" y="716" textLength="1320" lengthAdjust="spacingAndGlyphs" clip-path="url(#slice-c)">${blobWord}</text>
          <g class="blob-shards">
            <polygon class="blob-shard signal" points="160,330 420,260 370,420 120,460"/>
            <polygon class="blob-shard" points="1440,190 1740,250 1600,380 1390,320"/>
            <polygon class="blob-shard signal" points="1220,740 1730,690 1600,850 1280,830"/>
            <polygon class="blob-shard" points="240,760 590,700 510,880 170,850"/>
          </g>
          <g class="blob-data"><rect x="94" y="122" width="280" height="14"/><rect x="94" y="148" width="168" height="6"/><rect x="1510" y="918" width="304" height="12"/><rect x="1652" y="942" width="162" height="6"/></g>
          <rect class="blob-scan" x="72" y="526" width="1776" height="8"/>
        </svg>
        <div class="meta blob-meta" data-critical="true">${blobWord} / HOSTILE SIGNAL / LOOP 03.00</div>
        ${logo("blob-mark", "../../../assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg", true)}`,
      update(time) {
        const phase = (time / 3) * Math.PI * 2;
        const pulse = Math.abs(Math.sin(phase * 3));
        const snap = value => Math.round(value / 8) * 8;
        const displacement = stage.querySelector(".blob-displacement");
        const noise = stage.querySelector(".blob-noise");
        if (displacement) displacement.setAttribute("scale", String(20 + pulse * 98));
        if (noise) noise.setAttribute("baseFrequency", `${.008 + pulse * .009} ${.026 + pulse * .032}`);
        const main = stage.querySelector(".blob-main-group");
        const echo = stage.querySelector(".blob-echo-group");
        if (main) main.setAttribute("transform", `translate(${snap(Math.sin(phase * 4) * 26)} ${snap(Math.sin(phase * 6) * 12)}) skewX(${snap(Math.sin(phase * 3) * 4)})`);
        if (echo) echo.setAttribute("transform", `translate(${snap(Math.cos(phase * 5) * 54)} ${snap(Math.sin(phase * 4) * 32)})`);
        stage.querySelectorAll(".blob-slice").forEach((slice, index) => slice.setAttribute("transform", `translate(${snap(Math.sin(phase * (index + 5) + index) * (56 + index * 22))} 0)`));
        const orbs = stage.querySelectorAll(".blob-orb");
        if (orbs[0]) orbs[0].setAttribute("transform", `translate(${snap((1 - Math.cos(phase * 2)) * 240)} ${snap(Math.sin(phase * 5) * 108)})`);
        if (orbs[1]) orbs[1].setAttribute("transform", `translate(${snap(-(1 - Math.cos(phase * 3)) * 190)} ${snap(-Math.sin(phase * 4) * 92)})`);
        const shards = stage.querySelector(".blob-shards");
        if (shards) shards.setAttribute("transform", `translate(${snap(Math.sin(phase * 7) * 76)} ${snap(Math.cos(phase * 5) * 24)})`);
        const scan = stage.querySelector(".blob-scan");
        if (scan) scan.setAttribute("transform", `translate(0 ${snap(Math.sin(phase * 4) * 290)}) scale(${.25 + pulse * .75} 1)`);
      },
    },
    "ambient-field": {
      duration: 4,
      label: "Four-second monochrome dither and signal fracture ambient loop",
      html: `<div class="layer void-bg"></div>
        <svg class="ambient-field" viewBox="0 0 1280 720" aria-hidden="true">
          <defs>
            <filter id="ambient-noise" x="-15%" y="-20%" width="130%" height="140%">
              <feTurbulence class="ambient-turbulence" type="fractalNoise" baseFrequency=".006 .024" numOctaves="2" seed="31" result="noise"/>
              <feDisplacementMap class="ambient-displacement" in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="B"/>
            </filter>
            <pattern id="ambient-dither" width="8" height="8" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="1.4" height="1.4"/><rect x="5" y="5" width="1" height="1"/></pattern>
            <linearGradient id="ambient-fade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            <mask id="ambient-soft-mask"><rect width="1280" height="720" fill="url(#ambient-fade)"/></mask>
          </defs>
          <g class="ambient-dither-panels"><path d="M-40 84H420L352 230H-40ZM888 486h430v180H790Z"/><rect x="560" y="106" width="168" height="420"/></g>
          <g class="ambient-contours" filter="url(#ambient-noise)" mask="url(#ambient-soft-mask)">
            ${Array.from({ length: 9 }, (_, index) => `<path d="M-90 ${118 + index * 58} C120 ${42 + index * 64}, 210 ${206 + index * 42}, 390 ${130 + index * 57} S680 ${62 + index * 67}, 828 ${146 + index * 51} S1090 ${82 + index * 61}, 1370 ${126 + index * 58}"/>`).join("")}
          </g>
          <g class="ambient-route"><path d="M-20 578H174L244 510H456L532 286H744L816 354H1018L1092 216H1300"/><path class="ambient-route-dash" d="M84 640H338M926 94h270"/></g>
          <g class="ambient-calibration">${Array.from({ length: 42 }, (_, index) => `<line x1="${index * 32}" y1="${index % 4 === 0 ? 676 : 688}" x2="${index * 32}" y2="704"/>`).join("")}</g>
          <g class="ambient-code"><text x="46" y="56">PVKH / TRACE 07 / FIELD_Δ</text><text x="916" y="700">FRAME 096 — NO CARRIER</text><text x="902" y="184">X 43.771 / Y 11.246</text></g>
          <g class="ambient-slices"><rect x="0" y="214" width="1280" height="4"/><rect x="160" y="421" width="940" height="2"/><rect x="680" y="548" width="600" height="7"/></g>
          <g class="ambient-fragments"><rect x="178" y="151" width="294" height="14"/><rect x="828" y="392" width="184" height="9"/><rect x="1024" y="274" width="72" height="30"/></g>
        </svg>`,
      update(time) {
        const phase = (time / 4) * Math.PI * 2;
        const snap = value => Math.round(value / 8) * 8;
        const contours = stage.querySelector(".ambient-contours");
        if (contours) contours.setAttribute("transform", `translate(${snap(Math.sin(phase * 2) * 38)} ${snap(Math.cos(phase) * 14)})`);
        const panels = stage.querySelector(".ambient-dither-panels");
        if (panels) panels.setAttribute("transform", `translate(${snap(Math.sin(phase * 3) * 64)} 0)`);
        const burst = Math.pow(Math.max(0, Math.sin(phase * 4 - .7)), 18);
        const fragments = stage.querySelector(".ambient-fragments");
        if (fragments) fragments.setAttribute("transform", `translate(${snap((Math.sin(phase * 7) + burst * 7) * 34)} ${snap(burst * 24)})`);
        const slices = stage.querySelector(".ambient-slices");
        if (slices) slices.setAttribute("transform", `translate(${snap(Math.sin(phase * 5) * 110)} ${snap(Math.cos(phase * 3) * 10)})`);
        const displacement = stage.querySelector(".ambient-displacement");
        if (displacement) displacement.setAttribute("scale", String(10 + burst * 96));
      },
    },
    "lower-third": {
      duration: 4,
      label: "Four-second lower-third preset",
      html: `<div class="layer" style="background:#202020"></div><section class="lower-card" data-critical="true"><div class="display lower-artist">ARTIST NAME</div><div class="meta lower-release">RELEASE TITLE / PVKH-001</div>${logo("lower-mark", "../../../assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg", false)}</section><div class="lower-rule"></div>`,
      update(time) {
        const enter = ease(range(time, .18, .52));
        const leave = out(time, 3.35, 3.72);
        set("--lower-y", `${(1 - enter) * 260 + (1 - leave) * 260}px`);
        set("--lower-opacity", String(enter * leave));
        set("--lower-rule", `${Math.max(0, range(time, .48, .86) * out(time, 3.16, 3.44)) * 760}px`);
      },
    },
    story: {
      duration: 5,
      label: "Five-second vertical release-story preset",
      html: `<div class="layer void-bg"></div><div class="story-art"></div><div class="display story-artist" data-critical="true">ARTIST</div><div class="display story-release" data-critical="true">RELEASE</div><div class="meta story-meta" data-critical="true">PVKH-001 / DD.MM.YYYY<br>EXCERPT / 00:15</div>${logo("story-mark", "../../../assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg", true)}<div class="story-scan"></div>`,
      update(time) {
        const title = ease(range(time, .52, .92));
        const release = out(time, 4.36, 4.88);
        set("--story-pressure", String(ease(range(time, .16, .54))));
        set("--story-title-y", `${(1 - title) * 90}px`);
        set("--story-title-opacity", String(title * release));
        set("--story-meta-opacity", String(ease(range(time, .86, 1.16)) * release));
        set("--story-scan-y", `${250 + range(time, 1.18, 1.76) * 1350}px`);
        set("--story-scan-opacity", String(range(time, 1.12, 1.18) * out(time, 1.72, 1.84)));
      },
    },
  };

  scenes["blob-sound"] = scenes["blob-loop"];
  scenes["blob-process"] = scenes["blob-loop"];
  scenes["blob-archive"] = scenes["blob-loop"];
  scenes["blob-team"] = scenes["blob-loop"];
  scenes["blob-origin"] = scenes["blob-loop"];
  scenes["blob-signal"] = scenes["blob-loop"];
  scenes["blob-link"] = scenes["blob-loop"];
  scenes["blob-prime"] = scenes["blob-loop"];

  const current = scenes[scene];
  if (!current) throw new Error(`Unknown scene: ${scene}`);
  stage.dataset.scene = scene;
  stage.dataset.duration = String(current.duration);
  stage.setAttribute("aria-label", current.label);
  stage.innerHTML = current.html;
  const staticTime = reduceMotion && fixedTime === null ? Math.min(current.duration * .58, current.duration - .2) : fixedTime;
  let paused = false;
  let started = performance.now();
  let pauseAt = 0;

  const draw = time => current.update(clamp(time, 0, current.duration));
  const frame = now => {
    if (!paused) {
      const elapsed = ((now - started) / 1000) % current.duration;
      draw(elapsed);
    }
    requestAnimationFrame(frame);
  };

  addEventListener("message", event => {
    if (event.data === "pause") {
      paused = true;
      pauseAt = ((performance.now() - started) / 1000) % current.duration;
      draw(pauseAt);
    }
    if (event.data === "play") {
      started = performance.now() - pauseAt * 1000;
      paused = false;
    }
    if (event.data === "restart") {
      started = performance.now();
      pauseAt = 0;
      draw(0);
    }
  });

  Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode().catch(() => {}))]).then(() => {
    draw(staticTime === null ? 0 : staticTime);
    window.__POVKH_READY__ = true;
    if (staticTime === null) requestAnimationFrame(frame);
  });
})();

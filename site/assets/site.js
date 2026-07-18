(() => {
  "use strict";

  const site = window.PovkhSite = window.PovkhSite || {};

  const formatTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const minutes = Math.floor(safe / 60);
    const remainder = Math.floor(safe % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  const copyAttributes = (target, source, names) => {
    if (!target || !source) return;
    for (const name of names) {
      if (source.hasAttribute(name)) target.setAttribute(name, source.getAttribute(name));
      else target.removeAttribute(name);
    }
  };

  const initAudioPlayer = () => {
    const audioPlayer = document.querySelector("[data-audio-player]");
    if (!audioPlayer) return null;

    const audio = audioPlayer.querySelector("[data-audio-engine]");
    const canvas = audioPlayer.querySelector("[data-player-waveform]");
    const playhead = audioPlayer.querySelector("[data-player-playhead]");
    const toggle = audioPlayer.querySelector("[data-player-toggle]");
    const previous = audioPlayer.querySelector("[data-player-prev]");
    const next = audioPlayer.querySelector("[data-player-next]");
    const title = audioPlayer.querySelector("[data-player-title]");
    const artist = audioPlayer.querySelector("[data-player-artist]");
    const indexLabel = audioPlayer.querySelector("[data-player-index]");
    const timeLabel = audioPlayer.querySelector("[data-player-time]");
    const status = audioPlayer.querySelector("[data-player-status]");
    const playlistToggle = audioPlayer.querySelector("[data-player-playlist-toggle]");
    const playlistDialog = audioPlayer.querySelector("[data-player-playlist-dialog]");
    const playlistClose = audioPlayer.querySelector("[data-player-playlist-close]");
    const announcer = audioPlayer.querySelector("[data-player-announcer]");
    const trackElements = [...audioPlayer.querySelectorAll("[data-player-track]")];
    const tracks = trackElements.map((item) => ({
      element: item,
      select: item.matches("[data-player-select]")
        ? item
        : item.querySelector("[data-player-select]"),
      catalogId: item.dataset.catalogId,
      src: new URL(item.dataset.src, document.baseURI).href,
      waveform: new URL(item.dataset.waveform, document.baseURI).href,
      title: item.dataset.title,
      artist: item.dataset.artist,
      duration: Number(item.dataset.duration) || 0,
      isDefault: item.dataset.playerDefault === "true"
    }));

    if (!audio || !canvas || !playhead || !toggle || !previous || !next || !title
      || !artist || !indexLabel || !timeLabel || !status || !tracks.length) return null;

    const storageKey = "povkh-lab-player-v2";
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const waveformCache = new Map();
    let trackIndex = Math.max(0, tracks.findIndex((track) => track.isDefault));
    let waveformPeaks = [];
    let waveformAttempt = 0;
    let mediaAttempt = 0;
    let pendingRestoreTime = 0;
    let restoreFocusAfterDialog = true;

    const readState = () => {
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) || "null");
      } catch {
        return null;
      }
    };

    const saveState = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({
          trackIndex,
          catalogId: tracks[trackIndex].catalogId,
          currentTime: audio.currentTime || pendingRestoreTime || 0,
          userPaused: audioPlayer.dataset.userPaused === "true"
        }));
      } catch {
        // Playback still works when storage is unavailable.
      }
    };

    const drawWaveform = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const styles = getComputedStyle(audioPlayer);
      const progress = audio.duration ? Math.min(1, audio.currentTime / audio.duration) : 0;
      const center = height / 2;
      const count = waveformPeaks.length || 96;
      const gap = Math.max(1, width / count * 0.34);
      const barWidth = Math.max(1, width / count - gap);
      for (let index = 0; index < count; index += 1) {
        const peak = waveformPeaks[index] ?? (0.08 + (index % 7) * 0.012);
        const barHeight = Math.max(1, peak * height * 0.88);
        context.fillStyle = index / count <= progress
          ? styles.getPropertyValue("--signal").trim()
          : "rgba(242,239,231,0.42)";
        context.fillRect(index * width / count, center - barHeight / 2, barWidth, barHeight);
      }
      context.fillStyle = "rgba(242,239,231,0.16)";
      context.fillRect(0, Math.floor(center), width, 1);
    };

    const loadWaveform = async (track, attempt) => {
      if (waveformCache.has(track.src)) {
        if (attempt !== waveformAttempt) return;
        waveformPeaks = waveformCache.get(track.src);
        audioPlayer.dataset.waveformState = "ready";
        if (!["blocked", "error"].includes(audioPlayer.dataset.state)) status.textContent = "";
        drawWaveform();
        return;
      }
      try {
        const response = await fetch(track.waveform, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Waveform request failed: ${response.status}`);
        const waveform = await response.json();
        if (attempt !== waveformAttempt) return;
        if (waveform?.schemaVersion !== 1
          || waveform.source !== track.src.split("/").pop()
          || !Array.isArray(waveform.peaks)
          || waveform.peaks.length !== 160
          || waveform.peaks.some((peak) => !Number.isFinite(peak) || peak < 0 || peak > 1)) {
          throw new Error("Invalid waveform data");
        }
        waveformPeaks = waveform.peaks;
        waveformCache.set(track.src, waveformPeaks);
        audioPlayer.dataset.waveformState = "ready";
        if (!["blocked", "error"].includes(audioPlayer.dataset.state)) status.textContent = "";
        drawWaveform();
      } catch {
        if (attempt !== waveformAttempt) return;
        audioPlayer.dataset.waveformState = "error";
        if (!["blocked", "error"].includes(audioPlayer.dataset.state)) {
          status.textContent = status.dataset.waveformErrorLabel;
        }
        drawWaveform();
      }
    };

    const syncPlaylistUi = () => {
      for (const [index, track] of tracks.entries()) {
        const current = index === trackIndex;
        track.element.dataset.playerActive = String(current);
        const control = track.select || track.element;
        if (current) control.setAttribute("aria-current", "true");
        else control.removeAttribute("aria-current");
      }
    };

    const syncPlaybackUi = () => {
      const playing = !audio.paused && !audio.ended;
      toggle.textContent = playing ? toggle.dataset.pauseText : toggle.dataset.playText;
      toggle.setAttribute("aria-label", playing ? toggle.dataset.pauseLabel : toggle.dataset.playLabel);
      audioPlayer.dataset.playing = String(playing);
      const duration = Number.isFinite(audio.duration) ? audio.duration : tracks[trackIndex].duration;
      const displayTime = audio.currentTime || pendingRestoreTime || 0;
      const progress = duration ? Math.min(1, displayTime / duration) : 0;
      playhead.style.setProperty("--player-progress", String(progress));
      canvas.setAttribute("aria-valuemax", String(Math.round(duration || 0)));
      canvas.setAttribute("aria-valuenow", String(Math.round(displayTime)));
      canvas.setAttribute("aria-valuetext", `${formatTime(displayTime)} / ${formatTime(duration)}`);
      timeLabel.textContent = `${formatTime(displayTime)} / ${formatTime(duration)}`;
      drawWaveform();
    };

    const prepareAudio = (track, attempt = mediaAttempt) => {
      if (audio.getAttribute("src") === track.src) return;
      audio.src = track.src;
      audio.loop = tracks.length === 1;
      audio.addEventListener("loadedmetadata", () => {
        if (attempt !== mediaAttempt) return;
        if (pendingRestoreTime > 0 && pendingRestoreTime < audio.duration) {
          audio.currentTime = pendingRestoreTime;
        }
        pendingRestoreTime = 0;
        syncPlaybackUi();
      }, { once: true });
    };

    const attemptPlayback = async () => {
      prepareAudio(tracks[trackIndex]);
      try {
        await audio.play();
        audioPlayer.dataset.state = "playing";
        status.textContent = "";
      } catch (error) {
        const blocked = error?.name === "NotAllowedError" || error?.name === "AbortError";
        audioPlayer.dataset.state = blocked ? "blocked" : "error";
        status.textContent = blocked ? status.dataset.blockedLabel : status.dataset.audioErrorLabel;
      }
      syncPlaybackUi();
    };

    const syncMediaSession = (track) => {
      if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: "POVKH LAB / " + track.catalogId
      });
    };

    const announceTrack = (track) => {
      if (!announcer) return;
      const template = announcer.dataset.trackTemplate || "{title} — {artist}";
      announcer.textContent = template
        .replace("{title}", track.title)
        .replace("{artist}", track.artist);
    };

    const loadTrack = async (index, {
      restoreTime = 0,
      autoplay = true,
      deferMedia = false,
      userInitiated = false,
      announce = false
    } = {}) => {
      trackIndex = (index + tracks.length) % tracks.length;
      const track = tracks[trackIndex];
      mediaAttempt += 1;
      audio.pause();
      if (audio.getAttribute("src")) {
        audio.removeAttribute("src");
        audio.load();
      }
      if (userInitiated) audioPlayer.dataset.userPaused = "false";
      pendingRestoreTime = restoreTime;
      title.textContent = track.title;
      artist.textContent = track.artist;
      indexLabel.textContent = `${String(trackIndex + 1).padStart(2, "0")} / ${String(tracks.length).padStart(2, "0")}`;
      const hudIndexLabel = document.querySelector("[data-hud-player-index]");
      if (hudIndexLabel) hudIndexLabel.textContent = indexLabel.textContent;
      previous.disabled = tracks.length < 2;
      next.disabled = tracks.length < 2;
      waveformPeaks = [];
      waveformAttempt += 1;
      audioPlayer.dataset.waveformState = "loading";
      status.textContent = status.dataset.loadingLabel;
      syncPlaylistUi();
      drawWaveform();
      void loadWaveform(track, waveformAttempt);
      syncMediaSession(track);
      if (announce) announceTrack(track);
      if (!deferMedia) prepareAudio(track, mediaAttempt);
      if (autoplay) await attemptPlayback();
      else {
        audioPlayer.dataset.state = "paused";
        if (audioPlayer.dataset.waveformState !== "error") status.textContent = "";
        syncPlaybackUi();
      }
      saveState();
    };

    const seekToRatio = (ratio) => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : tracks[trackIndex].duration;
      if (!duration) return;
      const nextTime = Math.max(0, Math.min(duration, ratio * duration));
      if (audio.getAttribute("src")) audio.currentTime = nextTime;
      else pendingRestoreTime = nextTime;
      syncPlaybackUi();
      saveState();
    };

    const closePlaylist = ({ restoreFocus = true } = {}) => {
      if (!playlistDialog) return;
      restoreFocusAfterDialog = restoreFocus;
      if (playlistDialog.open && typeof playlistDialog.close === "function") playlistDialog.close();
      else {
        playlistDialog.removeAttribute("open");
        document.body.classList.remove("playlist-open");
        playlistToggle?.setAttribute("aria-expanded", "false");
        if (restoreFocus) playlistToggle?.focus({ preventScroll: true });
      }
    };

    const openPlaylist = () => {
      if (!playlistDialog || playlistDialog.open) return;
      restoreFocusAfterDialog = true;
      if (typeof playlistDialog.showModal === "function") playlistDialog.showModal();
      else playlistDialog.setAttribute("open", "");
      document.body.classList.add("playlist-open");
      playlistToggle?.setAttribute("aria-expanded", "true");
      const currentControl = tracks[trackIndex].select || tracks[trackIndex].element;
      currentControl.scrollIntoView?.({ block: "nearest" });
      currentControl.focus?.({ preventScroll: true });
    };

    toggle.addEventListener("click", async () => {
      if (audio.paused) {
        audioPlayer.dataset.userPaused = "false";
        await attemptPlayback();
      } else {
        audioPlayer.dataset.userPaused = "true";
        audio.pause();
        syncPlaybackUi();
      }
      saveState();
    });
    previous.addEventListener("click", () => void loadTrack(trackIndex - 1, {
      userInitiated: true,
      announce: true
    }));
    next.addEventListener("click", () => void loadTrack(trackIndex + 1, {
      userInitiated: true,
      announce: true
    }));
    canvas.addEventListener("pointerdown", (event) => {
      const rect = canvas.getBoundingClientRect();
      seekToRatio((event.clientX - rect.left) / rect.width);
    });
    canvas.addEventListener("keydown", (event) => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : tracks[trackIndex].duration;
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        seekToRatio(event.key === "Home" ? 0 : 1);
        return;
      }
      if (!event.key.startsWith("Arrow") || !duration) return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
      const currentTime = audio.currentTime || pendingRestoreTime || 0;
      seekToRatio((currentTime + direction * 5) / duration);
    });

    playlistToggle?.addEventListener("click", openPlaylist);
    playlistClose?.addEventListener("click", () => closePlaylist());
    playlistDialog?.addEventListener("close", () => {
      document.body.classList.remove("playlist-open");
      playlistToggle?.setAttribute("aria-expanded", "false");
      if (restoreFocusAfterDialog) playlistToggle?.focus({ preventScroll: true });
      restoreFocusAfterDialog = true;
    });
    playlistDialog?.addEventListener("click", (event) => {
      if (event.target !== playlistDialog) return;
      const rect = playlistDialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) closePlaylist();
    });
    for (const [index, track] of tracks.entries()) {
      track.select?.addEventListener("click", () => {
        void loadTrack(index, { userInitiated: true, announce: true });
        closePlaylist();
      });
    }

    audio.addEventListener("timeupdate", syncPlaybackUi);
    audio.addEventListener("play", () => {
      audioPlayer.dataset.state = "playing";
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
      syncPlaybackUi();
    });
    audio.addEventListener("pause", () => {
      if (!audio.error && !["blocked", "loading"].includes(audioPlayer.dataset.state)) {
        audioPlayer.dataset.state = "paused";
      }
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
      syncPlaybackUi();
    });
    audio.addEventListener("error", () => {
      audioPlayer.dataset.state = "error";
      status.textContent = status.dataset.audioErrorLabel;
      syncPlaybackUi();
    });
    audio.addEventListener("ended", () => {
      if (tracks.length > 1) {
        audioPlayer.dataset.userPaused = "false";
        void loadTrack(trackIndex + 1, { announce: true });
      }
    });

    const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(drawWaveform) : null;
    resizeObserver?.observe(canvas);

    if ("mediaSession" in navigator) {
      const mediaActions = {
        play: () => {
          audioPlayer.dataset.userPaused = "false";
          void attemptPlayback();
        },
        pause: () => {
          audioPlayer.dataset.userPaused = "true";
          audio.pause();
          saveState();
        },
        previoustrack: () => void loadTrack(trackIndex - 1, { userInitiated: true, announce: true }),
        nexttrack: () => void loadTrack(trackIndex + 1, { userInitiated: true, announce: true }),
        seekbackward: (details) => seekToRatio((audio.currentTime - (details.seekOffset || 10)) / (audio.duration || tracks[trackIndex].duration)),
        seekforward: (details) => seekToRatio((audio.currentTime + (details.seekOffset || 10)) / (audio.duration || tracks[trackIndex].duration)),
        seekto: (details) => seekToRatio(details.seekTime / (audio.duration || tracks[trackIndex].duration))
      };
      for (const [action, handler] of Object.entries(mediaActions)) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
      }
    }

    const syncLocaleFrom = (incomingDocument) => {
      const incomingPlayer = incomingDocument?.querySelector?.("[data-audio-player]");
      if (!incomingPlayer) return;

      copyAttributes(audioPlayer, incomingPlayer, ["aria-label"]);
      const copyPairs = [
        [previous, "[data-player-prev]", ["aria-label"], true],
        [next, "[data-player-next]", ["aria-label"], true],
        [canvas, "[data-player-waveform]", ["aria-label"], false],
        [playlistToggle, "[data-player-playlist-toggle]", ["aria-label"], false],
        [playlistDialog, "[data-player-playlist-dialog]", ["aria-label", "aria-labelledby"], false],
        [playlistClose, "[data-player-playlist-close]", ["aria-label"], true]
      ];
      for (const [current, selector, attributes, copyText] of copyPairs) {
        const incoming = incomingPlayer.querySelector(selector);
        if (!current || !incoming) continue;
        copyAttributes(current, incoming, attributes);
        if (copyText) current.textContent = incoming.textContent;
      }

      const incomingToggle = incomingPlayer.querySelector("[data-player-toggle]");
      if (incomingToggle) {
        copyAttributes(toggle, incomingToggle, [
          "data-play-label",
          "data-play-text",
          "data-pause-label",
          "data-pause-text"
        ]);
      }
      const incomingStatus = incomingPlayer.querySelector("[data-player-status]");
      if (incomingStatus) {
        copyAttributes(status, incomingStatus, [
          "data-loading-label",
          "data-blocked-label",
          "data-waveform-error-label",
          "data-audio-error-label"
        ]);
      }
      const incomingAnnouncer = incomingPlayer.querySelector("[data-player-announcer]");
      if (announcer && incomingAnnouncer) {
        copyAttributes(announcer, incomingAnnouncer, ["data-track-template"]);
      }

      for (const current of audioPlayer.querySelectorAll("[data-player-copy]")) {
        const key = current.dataset.playerCopy;
        const incoming = [...incomingPlayer.querySelectorAll("[data-player-copy]")]
          .find((candidate) => candidate.dataset.playerCopy === key);
        if (!incoming || current.matches("[data-player-title], [data-player-artist], [data-player-index], [data-player-time]")) continue;
        current.textContent = incoming.textContent;
        copyAttributes(current, incoming, ["aria-label", "data-track-template"]);
      }

      for (const track of tracks) {
        const incomingTrack = [...incomingPlayer.querySelectorAll("[data-player-track]")]
          .find((item) => item.dataset.catalogId === track.catalogId);
        const incomingControl = incomingTrack?.matches("[data-player-select]")
          ? incomingTrack
          : incomingTrack?.querySelector("[data-player-select]");
        if (track.select && incomingControl) copyAttributes(track.select, incomingControl, ["aria-label"]);
      }

      if (audioPlayer.dataset.state === "blocked") status.textContent = status.dataset.blockedLabel;
      else if (audioPlayer.dataset.state === "error") status.textContent = status.dataset.audioErrorLabel;
      else if (audioPlayer.dataset.waveformState === "error") status.textContent = status.dataset.waveformErrorLabel;
      else if (audioPlayer.dataset.waveformState === "loading") status.textContent = status.dataset.loadingLabel;
      else status.textContent = "";
      syncPlaybackUi();
    };

    const saved = readState();
    const savedTrackIndex = saved?.catalogId
      ? tracks.findIndex((track) => track.catalogId === saved.catalogId)
      : -1;
    if (savedTrackIndex >= 0) trackIndex = savedTrackIndex;
    audioPlayer.dataset.userPaused = String(Boolean(saved?.userPaused));
    audioPlayer.classList.add("is-ready");
    document.body.classList.add("audio-player-ready");
    playlistToggle?.setAttribute("aria-expanded", String(Boolean(playlistDialog?.open)));
    const syncPlayerScrollMode = () => audioPlayer.classList.toggle("is-scrolled", scrollY > 180);
    window.addEventListener("scroll", syncPlayerScrollMode, { passive: true });
    syncPlayerScrollMode();
    syncPlaylistUi();
    void loadTrack(trackIndex, {
      restoreTime: Number(saved?.currentTime) || 0,
      autoplay: !saved?.userPaused && !connection?.saveData,
      deferMedia: Boolean(connection?.saveData)
    });

    return {
      element: audioPlayer,
      audio,
      tracks,
      closePlaylist,
      loadTrack,
      saveState,
      syncLocaleFrom
    };
  };

  const initHud = () => {
    const hudFrame = document.querySelector("[data-hud-frame]");
    if (!hudFrame) return () => {};
    const desktopHud = window.matchMedia("(min-width: 80rem)");
    const main = document.querySelector("main");
    const ticks = [...hudFrame.querySelectorAll("[data-hud-tick]")];
    const rulerValues = [...hudFrame.querySelectorAll("[data-hud-ruler-value]")];
    const currentSection = hudFrame.querySelector("[data-hud-section-current]");
    const nextSection = hudFrame.querySelector("[data-hud-section-next]");
    const sectionTitle = hudFrame.querySelector("[data-hud-section-title]");
    const baseline = hudFrame.querySelector("[data-hud-baseline]");
    const depth = hudFrame.querySelector("[data-hud-depth]");
    const node = hudFrame.querySelector("[data-hud-node]");
    const progressLabel = hudFrame.querySelector("[data-hud-progress]");
    const signalSection = hudFrame.querySelector("[data-hud-signal-section]");
    const offset = hudFrame.querySelector("[data-hud-offset]");
    const mode = hudFrame.querySelector("[data-hud-mode]");
    const abortController = new AbortController();
    const sections = main ? [...main.querySelectorAll(":scope > .container > :is(.hero, .section), :scope > .section")] : [];
    const pageKey = [...document.body.classList]
      .find((className) => className.startsWith("page-"))
      ?.slice(5)
      .replaceAll("-", ".")
      .toUpperCase() || "PAGE";
    let frameId = 0;
    let firstHudSync = true;
    let lastScrollPosition = scrollY;
    let scrollDirection = 0;
    let directionTravel = 0;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const pad = (value, size = 4) => String(Math.max(0, Math.round(value))).padStart(size, "0");
    const sectionName = (section, index) => {
      const heading = section?.querySelector("h1, h2")?.textContent || `SECTION ${index + 1}`;
      return heading.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 18);
    };

    const syncHud = () => {
      frameId = 0;
      if (!desktopHud.matches) return;
      const currentScrollPosition = scrollY;
      const scrollDelta = currentScrollPosition - lastScrollPosition;
      const nextDirection = Math.sign(scrollDelta);
      if (nextDirection && nextDirection !== scrollDirection) {
        scrollDirection = nextDirection;
        directionTravel = 0;
      }
      directionTravel += Math.abs(scrollDelta);
      if (firstHudSync) {
        hudFrame.classList.toggle("is-timeline-hidden", currentScrollPosition > 160);
        firstHudSync = false;
      } else if (currentScrollPosition <= 72) {
        hudFrame.classList.remove("is-timeline-hidden");
        directionTravel = 0;
      } else if (scrollDirection > 0 && directionTravel >= 24) {
        hudFrame.classList.add("is-timeline-hidden");
      } else if (scrollDirection < 0 && directionTravel >= 16) {
        hudFrame.classList.remove("is-timeline-hidden");
      }
      lastScrollPosition = currentScrollPosition;

      const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const pageProgress = clamp(scrollY / maxScroll, 0, 1);
      const focusY = scrollY + innerHeight * 0.42;
      let sectionIndex = 0;
      sections.forEach((section, index) => {
        const top = section.getBoundingClientRect().top + scrollY;
        if (top <= focusY) sectionIndex = index;
      });
      const sectionNumber = sectionIndex + 1;
      const nextNumber = Math.min(sections.length || 1, sectionNumber + 1);
      const sectionCode = pad(sectionNumber, 2);
      const progress = `${pad(pageProgress * 100, 3)}%`;
      const yValue = `Y ${pad(scrollY)}`;
      ticks.forEach((tick, index) => {
        tick.textContent = pad(scrollY + (innerHeight * index) / Math.max(1, ticks.length - 1));
      });
      rulerValues.forEach((value, index) => {
        value.textContent = pad(scrollY + (innerHeight * index) / Math.max(1, rulerValues.length - 1));
      });
      if (currentSection) currentSection.textContent = sectionCode;
      if (nextSection) nextSection.textContent = pad(nextNumber, 2);
      if (sectionTitle) sectionTitle.textContent = sectionName(sections[sectionIndex], sectionIndex);
      if (baseline) baseline.textContent = yValue;
      if (depth) depth.textContent = `DEPTH ${progress}`;
      if (node) node.textContent = `${pageKey}.${sectionCode}`;
      if (progressLabel) progressLabel.textContent = progress;
      if (signalSection) signalSection.textContent = sectionCode;
      if (offset) offset.textContent = yValue;
      if (mode) mode.textContent = `VIEW.${sectionCode}`;
      hudFrame.dataset.hudSection = sectionCode;
      hudFrame.style.setProperty("--hud-grid-shift", `${-(scrollY % 96)}px`);
      hudFrame.style.setProperty("--hud-ruler-shift", `${scrollY % 46}px`);
      hudFrame.style.setProperty("--hud-ruler-cursor-y", `${pageProgress * Math.max(1, innerHeight - 336)}px`);
      hudFrame.style.setProperty("--hud-cross-y", `${24 + pageProgress * Math.max(1, innerHeight - 176)}px`);
    };

    const requestHudSync = () => {
      if (!frameId) frameId = requestAnimationFrame(syncHud);
    };
    window.addEventListener("scroll", requestHudSync, { passive: true, signal: abortController.signal });
    window.addEventListener("resize", requestHudSync, { passive: true, signal: abortController.signal });
    desktopHud.addEventListener?.("change", requestHudSync);
    requestHudSync();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      abortController.abort();
      desktopHud.removeEventListener?.("change", requestHudSync);
    };
  };

  const initMotion = () => {
    const motionVideos = [...document.querySelectorAll("[data-motion-video]")];
    if (!motionVideos.length) return () => {};
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compactViewport = window.matchMedia("(max-width: 48rem)");
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    let disposed = false;

    const disableMotion = (video) => {
      const nextAttempt = Number.parseInt(video.dataset.motionAttempt || "0", 10) + 1;
      video.dataset.motionAttempt = String(nextAttempt);
      video.dataset.motionState = "disabled";
      video.pause();
      for (const source of video.querySelectorAll("source")) source.removeAttribute("src");
      video.removeAttribute("src");
      video.load();
    };
    const enableMotion = (video) => {
      if (video.dataset.motionState === "active" || video.dataset.motionState === "loading") return;
      const attempt = Number.parseInt(video.dataset.motionAttempt || "0", 10) + 1;
      video.dataset.motionAttempt = String(attempt);
      for (const source of video.querySelectorAll("source[data-src]")) {
        const sourceUrl = compactViewport.matches && source.dataset.mobileSrc
          ? source.dataset.mobileSrc
          : source.dataset.src;
        source.setAttribute("src", sourceUrl);
      }
      video.dataset.motionState = "loading";
      video.load();
      const playback = video.play();
      if (playback) {
        playback.then(() => {
          if (!disposed && video.dataset.motionState === "loading" && video.dataset.motionAttempt === String(attempt)) {
            video.dataset.motionState = "active";
          }
        }).catch(() => {
          if (!disposed && video.dataset.motionState === "loading" && video.dataset.motionAttempt === String(attempt)) {
            video.dataset.motionState = "paused";
          }
        });
      } else if (!disposed && video.dataset.motionState === "loading" && video.dataset.motionAttempt === String(attempt)) {
        video.dataset.motionState = "paused";
      }
    };
    const syncMotion = () => {
      const shouldLoad = !reducedMotion.matches && !connection?.saveData;
      for (const video of motionVideos) {
        if (shouldLoad) enableMotion(video);
        else disableMotion(video);
      }
    };
    const syncViewportMotion = () => {
      for (const video of motionVideos) disableMotion(video);
      syncMotion();
    };
    reducedMotion.addEventListener?.("change", syncMotion);
    compactViewport.addEventListener?.("change", syncViewportMotion);
    connection?.addEventListener?.("change", syncMotion);
    syncMotion();

    return () => {
      disposed = true;
      reducedMotion.removeEventListener?.("change", syncMotion);
      compactViewport.removeEventListener?.("change", syncViewportMotion);
      connection?.removeEventListener?.("change", syncMotion);
      for (const video of motionVideos) video.pause();
    };
  };

  const initSignalField = () => {
    const signalStage = document.querySelector("[data-signal-field]");
    const main = document.querySelector("main");
    const overlay = signalStage?.querySelector("[data-signal-overlay]");
    const magneticLink = signalStage?.querySelector("[data-signal-panel-link]");
    const targetBrackets = signalStage?.querySelector("[data-signal-target-brackets]");
    if (!signalStage || !main || !overlay || !magneticLink || !targetBrackets) return () => {};

    const abortController = new AbortController();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const pointer = { active: false, clientX: 0, clientY: 0 };
    const audioPlayer = site.player?.element || document.querySelector("[data-audio-player]");
    const candidates = [
      ...main.querySelectorAll("a[href], button"),
      ...(audioPlayer ? audioPlayer.querySelectorAll("button") : [])
    ];
    let width = 1;
    let height = 1;
    let frameId = 0;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const round = (value) => Math.round(value * 10) / 10;
    const snap = (value, unit = 6) => Math.round(value / unit) * unit;
    const canTrack = () => finePointer.matches && !reducedMotion.matches && !connection?.saveData;
    const pathFromPoints = (points) => points
      .map((point, index) => (index ? "L " : "M ") + round(point.x) + " " + round(point.y))
      .join(" ");
    const setMode = (value) => {
      signalStage.dataset.signalMode = value;
      overlay.dataset.signalMode = value;
    };
    const clearTarget = () => {
      magneticLink.setAttribute("d", "");
      targetBrackets.setAttribute("d", "");
      signalStage.dataset.signalTarget = "";
    };
    const targetCodeFor = (element, index) => {
      const releaseCode = element.querySelector?.(".release-card-code")?.textContent?.trim();
      if (releaseCode) return releaseCode;
      const releaseId = element.dataset.releaseId?.trim();
      if (releaseId) return releaseId;
      const label = element.getAttribute("aria-label") || element.textContent || "";
      return label.trim().replace(/\s+/g, " ").slice(0, 36).toUpperCase() || "TARGET-" + (index + 1);
    };

    const draw = () => {
      frameId = 0;
      if (!pointer.active || !canTrack()) {
        clearTarget();
        setMode("static");
        return;
      }
      const stageRect = signalStage.getBoundingClientRect();
      const cursor = {
        x: clamp(pointer.clientX - stageRect.left, 0, width),
        y: clamp(pointer.clientY - stageRect.top, 0, height)
      };
      let nearest = null;
      candidates.forEach((element, index) => {
        if (element.disabled) return;
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        if (styles.display === "none" || styles.visibility === "hidden"
          || rect.width < 20 || rect.height < 20
          || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) return;
        const local = {
          left: rect.left - stageRect.left,
          top: rect.top - stageRect.top,
          right: rect.right - stageRect.left,
          bottom: rect.bottom - stageRect.top
        };
        const dx = Math.max(local.left - cursor.x, 0, cursor.x - local.right);
        const dy = Math.max(local.top - cursor.y, 0, cursor.y - local.bottom);
        const distance = Math.hypot(dx, dy);
        const score = distance + Math.min(42, Math.sqrt(rect.width * rect.height) * 0.035);
        if (!nearest || score < nearest.score) nearest = { element, index, local, distance, score };
      });
      setMode("tracking");
      if (!nearest || nearest.distance > 260) {
        clearTarget();
        return;
      }
      const inset = 5;
      const rect = {
        left: clamp(nearest.local.left - inset, 2, width - 2),
        top: clamp(nearest.local.top - inset, 2, height - 2),
        right: clamp(nearest.local.right + inset, 2, width - 2),
        bottom: clamp(nearest.local.bottom + inset, 2, height - 2)
      };
      const bracket = clamp(Math.min(rect.right - rect.left, rect.bottom - rect.top) * 0.16, 12, 24);
      targetBrackets.setAttribute("d", [
        "M " + round(rect.left) + " " + round(rect.top + bracket) + " L " + round(rect.left) + " " + round(rect.top) + " L " + round(rect.left + bracket) + " " + round(rect.top),
        "M " + round(rect.right - bracket) + " " + round(rect.top) + " L " + round(rect.right) + " " + round(rect.top) + " L " + round(rect.right) + " " + round(rect.top + bracket),
        "M " + round(rect.right) + " " + round(rect.bottom - bracket) + " L " + round(rect.right) + " " + round(rect.bottom) + " L " + round(rect.right - bracket) + " " + round(rect.bottom),
        "M " + round(rect.left + bracket) + " " + round(rect.bottom) + " L " + round(rect.left) + " " + round(rect.bottom) + " L " + round(rect.left) + " " + round(rect.bottom - bracket)
      ].join(" "));
      const inside = cursor.x >= rect.left && cursor.x <= rect.right
        && cursor.y >= rect.top && cursor.y <= rect.bottom;
      let anchor;
      if (inside) {
        const edges = [
          { x: rect.left, y: cursor.y },
          { x: rect.right, y: cursor.y },
          { x: cursor.x, y: rect.top },
          { x: cursor.x, y: rect.bottom }
        ];
        anchor = edges.reduce((best, point) => (
          Math.hypot(point.x - cursor.x, point.y - cursor.y) < Math.hypot(best.x - cursor.x, best.y - cursor.y)
            ? point : best
        ));
      } else {
        anchor = {
          x: clamp(cursor.x, rect.left, rect.right),
          y: clamp(cursor.y, rect.top, rect.bottom)
        };
      }
      const elbow = {
        x: snap(cursor.x + (anchor.x - cursor.x) * 0.58),
        y: snap(cursor.y + (anchor.y - cursor.y) * 0.22)
      };
      magneticLink.setAttribute("d", pathFromPoints([cursor, elbow, anchor]));
      signalStage.dataset.signalTarget = targetCodeFor(nearest.element, nearest.index);
    };

    const requestDraw = () => {
      if (!frameId) frameId = requestAnimationFrame(draw);
    };
    const resize = () => {
      const rect = signalStage.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      overlay.setAttribute("viewBox", "0 0 " + round(width) + " " + round(height));
      requestDraw();
    };
    const onPointerMove = (event) => {
      if (!canTrack() || (event.pointerType && !["mouse", "pen"].includes(event.pointerType))) return;
      const rect = signalStage.getBoundingClientRect();
      if (event.clientY < Math.max(0, rect.top) || event.clientY > Math.min(innerHeight, rect.bottom)) {
        pointer.active = false;
        requestDraw();
        return;
      }
      pointer.active = true;
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      requestDraw();
    };
    const stopTracking = () => {
      pointer.active = false;
      requestDraw();
    };
    const syncPreferences = () => {
      const reduced = !canTrack();
      signalStage.classList.toggle("signal-field-reduced", reduced);
      overlay.classList.toggle("signal-field-reduced", reduced);
      if (reduced) stopTracking();
      else requestDraw();
    };

    const resizeObserver = new ResizeObserver(resize);
    const preferenceTargets = [reducedMotion, finePointer, connection].filter((target) => target?.addEventListener);
    for (const target of preferenceTargets) target.addEventListener("change", syncPreferences);
    window.addEventListener("pointermove", onPointerMove, { passive: true, signal: abortController.signal });
    window.addEventListener("scroll", requestDraw, { passive: true, signal: abortController.signal });
    window.addEventListener("blur", stopTracking, { signal: abortController.signal });
    document.documentElement.addEventListener("pointerleave", stopTracking, { passive: true, signal: abortController.signal });
    resizeObserver.observe(signalStage);
    signalStage.classList.add("signal-field-ready");
    resize();
    syncPreferences();

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      abortController.abort();
      resizeObserver.disconnect();
      for (const target of preferenceTargets) target.removeEventListener("change", syncPreferences);
      clearTarget();
    };
  };

  const initLocalized404 = () => {
    if (!document.body.classList.contains("page-404") || document.documentElement.lang !== "en") return () => {};
    const basePath = document.documentElement.dataset.siteBase || "";
    const localPath = basePath && location.pathname.startsWith(`${basePath}/`)
      ? location.pathname.slice(basePath.length)
      : location.pathname;
    const notFoundLocale = localPath.match(/^\/(it|ru)(?:\/|$)/)?.[1] || null;
    if (notFoundLocale) location.replace(`${basePath}/${notFoundLocale}/404.html`);
    return () => {};
  };

  const initMobileMenu = () => {
    const mobileMenu = document.querySelector(".mobile-nav");
    if (!mobileMenu) return () => {};
    const abortController = new AbortController();
    mobileMenu.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileMenu.open) {
        mobileMenu.open = false;
        mobileMenu.querySelector("summary")?.focus();
      }
    }, { signal: abortController.signal });
    mobileMenu.addEventListener("click", (event) => {
      if (event.target.closest("a")) mobileMenu.open = false;
    }, { signal: abortController.signal });
    return () => abortController.abort();
  };

  const initCatalogFilters = () => {
    const catalogFilters = document.querySelector("[data-catalog-filters]");
    if (!catalogFilters) return () => {};
    const abortController = new AbortController();
    const buttons = [...catalogFilters.querySelectorAll("[data-filter-value]")];
    const cards = [...document.querySelectorAll("[data-release-card]")];
    const result = catalogFilters.querySelector("[data-filter-result]");
    const resultTemplate = catalogFilters.dataset.resultsTemplate || "{visible} / {total}";
    const applyFilter = (value) => {
      let visible = 0;
      for (const card of cards) {
        const matches = value === "all" || card.dataset.releaseStatus === value;
        card.hidden = !matches;
        if (matches) visible += 1;
      }
      for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.filterValue === value));
      if (result) {
        result.textContent = resultTemplate
          .replace("{visible}", String(visible))
          .replace("{total}", String(cards.length));
      }
    };
    for (const button of buttons) {
      button.addEventListener("click", () => applyFilter(button.dataset.filterValue), { signal: abortController.signal });
    }
    applyFilter("all");
    return () => abortController.abort();
  };

  const initArtistGalleries = () => {
    const galleries = [...document.querySelectorAll("[data-artist-gallery]")];
    if (!galleries.length) return () => {};
    const abortController = new AbortController();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resizeObservers = [];
    const pendingFrames = new Set();

    for (const gallery of galleries) {
      const track = gallery.querySelector("[data-gallery-track]");
      const slides = [...gallery.querySelectorAll("[data-gallery-slide]")];
      const previous = gallery.querySelector("[data-gallery-previous]");
      const next = gallery.querySelector("[data-gallery-next]");
      const counter = gallery.querySelector("[data-gallery-counter]");
      if (!track || slides.length < 2 || !previous || !next || !counter) continue;

      let activeIndex = 0;
      let frameId = 0;
      let pointerId = null;
      let pointerStartX = 0;
      let pointerStartScroll = 0;
      let pointerMoved = false;

      const nearestIndex = () => Math.max(0, Math.min(
        slides.length - 1,
        Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
      ));
      const sync = () => {
        if (frameId) pendingFrames.delete(frameId);
        frameId = 0;
        activeIndex = nearestIndex();
        gallery.dataset.galleryIndex = String(activeIndex);
        slides.forEach((slide, index) => {
          if (index === activeIndex) slide.setAttribute("aria-current", "true");
          else slide.removeAttribute("aria-current");
        });
        previous.disabled = activeIndex === 0;
        next.disabled = activeIndex === slides.length - 1;
        counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
        counter.setAttribute("aria-label", slides[activeIndex].getAttribute("aria-label") || counter.textContent);
      };
      const requestSync = () => {
        if (frameId) return;
        frameId = requestAnimationFrame(sync);
        pendingFrames.add(frameId);
      };
      const goTo = (index) => {
        const targetIndex = Math.max(0, Math.min(slides.length - 1, index));
        track.scrollTo({
          left: slides[targetIndex].offsetLeft,
          behavior: reducedMotion.matches ? "auto" : "smooth"
        });
        activeIndex = targetIndex;
        requestSync();
      };
      const finishPointerDrag = (event) => {
        if (pointerId === null || event.pointerId !== pointerId) return;
        if (track.hasPointerCapture?.(pointerId)) track.releasePointerCapture(pointerId);
        pointerId = null;
        track.classList.remove("is-dragging");
        if (pointerMoved) goTo(nearestIndex());
      };

      previous.addEventListener("click", () => goTo(activeIndex - 1), { signal: abortController.signal });
      next.addEventListener("click", () => goTo(activeIndex + 1), { signal: abortController.signal });
      track.addEventListener("scroll", requestSync, { passive: true, signal: abortController.signal });
      track.addEventListener("keydown", (event) => {
        const target = event.key === "ArrowLeft" ? activeIndex - 1
          : event.key === "ArrowRight" ? activeIndex + 1
            : event.key === "Home" ? 0
              : event.key === "End" ? slides.length - 1
                : null;
        if (target === null) return;
        event.preventDefault();
        goTo(target);
      }, { signal: abortController.signal });
      track.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !["mouse", "pen"].includes(event.pointerType)) return;
        pointerId = event.pointerId;
        pointerStartX = event.clientX;
        pointerStartScroll = track.scrollLeft;
        pointerMoved = false;
        track.setPointerCapture?.(pointerId);
      }, { signal: abortController.signal });
      track.addEventListener("pointermove", (event) => {
        if (pointerId === null || event.pointerId !== pointerId) return;
        const delta = event.clientX - pointerStartX;
        if (!pointerMoved && Math.abs(delta) < 6) return;
        pointerMoved = true;
        track.classList.add("is-dragging");
        track.scrollLeft = pointerStartScroll - delta;
      }, { signal: abortController.signal });
      track.addEventListener("pointerup", finishPointerDrag, { signal: abortController.signal });
      track.addEventListener("pointercancel", finishPointerDrag, { signal: abortController.signal });

      if (typeof ResizeObserver === "function") {
        const resizeObserver = new ResizeObserver(requestSync);
        resizeObserver.observe(track);
        resizeObservers.push(resizeObserver);
      }
      sync();
    }

    return () => {
      abortController.abort();
      for (const frameId of pendingFrames) cancelAnimationFrame(frameId);
      for (const resizeObserver of resizeObservers) resizeObserver.disconnect();
    };
  };

  let disposeCurrentRoute = () => {};
  site.disposeRoute = () => {
    disposeCurrentRoute();
    disposeCurrentRoute = () => {};
  };
  site.initRoute = () => {
    site.disposeRoute();
    const cleanups = [
      initHud(),
      initMotion(),
      initSignalField(),
      initLocalized404(),
      initMobileMenu(),
      initCatalogFilters(),
      initArtistGalleries()
    ];
    let disposed = false;
    disposeCurrentRoute = () => {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
    };
  };

  if (!site.player) site.player = initAudioPlayer();
  site.initRoute();
  document.documentElement.classList.add("js-ready");
  window.addEventListener("pagehide", () => {
    site.player?.saveState();
    site.disposeRoute();
  }, { once: true });
})();

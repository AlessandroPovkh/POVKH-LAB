(() => {
  "use strict";

  if (window.PovkhRouter) return;

  const site = window.PovkhSite;
  const supported = Boolean(site
    && typeof fetch === "function"
    && typeof DOMParser === "function"
    && typeof history.pushState === "function"
    && /^https?:$/.test(location.protocol));
  const router = window.PovkhRouter = { enabled: supported };
  if (!supported) return;

  const ROUTE_MARKER = "povkhRoute";
  const runtimeBodyClasses = new Set(["audio-player-ready", "playlist-open"]);
  const pageCache = new Map();
  const parser = new DOMParser();
  let navigationController = null;
  let navigationSequence = 0;
  let navigating = false;
  let historyFrame = 0;

  const siteBasePath = () => document.documentElement.dataset.siteBase || "";
  const withinSiteBase = (pathname) => {
    const basePath = siteBasePath();
    return !basePath || pathname === basePath || pathname.startsWith(`${basePath}/`);
  };

  const normalizePersistentResourceUrls = () => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"], link[rel="icon"], link[rel="preload"]')) {
      if (link.href) link.setAttribute("href", link.href);
    }
    for (const script of document.querySelectorAll("script[src]")) {
      if (script.src) script.setAttribute("src", script.src);
    }
  };

  const routeNode = (root, kind) => {
    const selectors = {
      header: "[data-route-header], .site-header",
      main: "[data-route-main], main#main-content",
      footer: "[data-route-footer], .site-footer",
      skip: "[data-route-skip], .skip-link"
    };
    return root.querySelector(selectors[kind]);
  };

  const currentFocusState = () => {
    const active = document.activeElement;
    if (!(active instanceof Element) || active === document.body || active === document.documentElement) {
      return { focusId: null, focusUrl: null };
    }
    const routeRegion = active.closest("[data-route-header], .site-header, [data-route-main], main, [data-route-footer], .site-footer");
    if (!routeRegion) return { focusId: null, focusUrl: null };
    const anchor = active.closest("a[href]");
    return {
      focusId: active.id || null,
      focusUrl: anchor?.href || null
    };
  };

  const routeState = (overrides = {}) => ({
    ...(history.state && typeof history.state === "object" ? history.state : {}),
    [ROUTE_MARKER]: true,
    scrollX,
    scrollY,
    ...currentFocusState(),
    ...overrides
  });

  const persistHistoryEntry = () => {
    if (navigating) return;
    try {
      history.replaceState(routeState(), "", location.href);
    } catch {
      // Navigation still works when an embedded browser blocks state writes.
    }
  };

  const scheduleHistoryPersist = () => {
    if (navigating || historyFrame) return;
    historyFrame = requestAnimationFrame(() => {
      historyFrame = 0;
      persistHistoryEntry();
    });
  };

  const eligibleLink = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || anchor.hasAttribute("data-router-ignore") || anchor.hasAttribute("data-no-router")) return null;
    if (anchor.target && anchor.target.toLowerCase() !== "_self") return null;
    let url;
    try {
      url = new URL(anchor.href, location.href);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin || !withinSiteBase(url.pathname)) return null;
    const leaf = url.pathname.split("/").filter(Boolean).pop() || "";
    if (leaf.includes(".") && !leaf.toLowerCase().endsWith(".html")) return null;
    return { anchor, url };
  };

  const copyBodyContract = (incomingBody) => {
    const preserved = [...runtimeBodyClasses].filter((className) => document.body.classList.contains(className));
    document.body.className = incomingBody.className;
    for (const className of preserved) document.body.classList.add(className);
    for (const attribute of [...document.body.attributes]) {
      if (attribute.name.startsWith("data-")) document.body.removeAttribute(attribute.name);
    }
    for (const attribute of incomingBody.attributes) {
      if (attribute.name.startsWith("data-")) document.body.setAttribute(attribute.name, attribute.value);
    }
  };

  const cloneHeadNode = (node, targetUrl) => {
    const clone = document.importNode(node, true);
    if (clone instanceof HTMLLinkElement && clone.hasAttribute("href")) {
      clone.setAttribute("href", new URL(node.getAttribute("href"), targetUrl).href);
    }
    return clone;
  };

  const replaceHeadGroup = (incomingDocument, selector, targetUrl) => {
    for (const current of document.head.querySelectorAll(selector)) current.remove();
    for (const incoming of incomingDocument.head.querySelectorAll(selector)) {
      document.head.append(cloneHeadNode(incoming, targetUrl));
    }
  };

  const updateHead = (incomingDocument, targetUrl) => {
    document.title = incomingDocument.title;
    for (const selector of [
      'meta[name="description"]',
      'link[rel="canonical"]',
      'link[rel="alternate"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'link[rel="manifest"]'
    ]) replaceHeadGroup(incomingDocument, selector, targetUrl);

    const currentStructuredData = document.head.querySelector('script[type="application/ld+json"]');
    const incomingStructuredData = incomingDocument.head.querySelector('script[type="application/ld+json"]');
    if (currentStructuredData && incomingStructuredData) {
      currentStructuredData.textContent = incomingStructuredData.textContent;
    }
  };

  const safeRouteClone = (node) => {
    const clone = document.importNode(node, true);
    for (const executable of clone.querySelectorAll("script, style, link, meta, base")) executable.remove();
    return clone;
  };

  const validateIncomingDocument = (incomingDocument) => {
    const incomingHeader = routeNode(incomingDocument, "header");
    const incomingMain = routeNode(incomingDocument, "main");
    const incomingFooter = routeNode(incomingDocument, "footer");
    const incomingPlayer = incomingDocument.querySelectorAll("[data-audio-player]");
    if (!incomingDocument.body
      || incomingDocument.body.dataset.siteStatus !== document.body.dataset.siteStatus
      || !incomingHeader
      || !incomingMain
      || !incomingFooter
      || incomingPlayer.length !== 1) {
      throw new Error("Fetched document is not a valid POVKH LAB route");
    }
    return { incomingHeader, incomingMain, incomingFooter };
  };

  const fetchRoute = async (requestedUrl, signal) => {
    const cacheKey = `${requestedUrl.origin}${requestedUrl.pathname}${requestedUrl.search}`;
    const cached = pageCache.get(cacheKey);
    if (cached) {
      const targetUrl = new URL(cached.responseUrl);
      targetUrl.hash = requestedUrl.hash;
      return { incomingDocument: parser.parseFromString(cached.html, "text/html"), targetUrl };
    }

    const response = await fetch(requestedUrl.href, {
      cache: "no-cache",
      credentials: "same-origin",
      headers: { Accept: "text/html" },
      signal
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().startsWith("text/html")) {
      throw new Error(`Route request failed: ${response.status}`);
    }
    const responseUrl = new URL(response.url);
    if (responseUrl.origin !== location.origin || !withinSiteBase(responseUrl.pathname)) {
      throw new Error("Route request escaped the configured site base");
    }
    const html = await response.text();
    pageCache.set(cacheKey, { html, responseUrl: responseUrl.href });
    pageCache.set(`${responseUrl.origin}${responseUrl.pathname}${responseUrl.search}`, {
      html,
      responseUrl: responseUrl.href
    });
    responseUrl.hash = requestedUrl.hash;
    return { incomingDocument: parser.parseFromString(html, "text/html"), targetUrl: responseUrl };
  };

  const focusForRoute = ({ targetUrl, navigationType, restoreState }) => {
    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    try {
      if (targetUrl.hash) {
        let hashId = targetUrl.hash.slice(1);
        try { hashId = decodeURIComponent(hashId); } catch { /* Preserve the encoded id. */ }
        const target = document.getElementById(hashId);
        if (target) {
          const hadTabIndex = target.hasAttribute("tabindex");
          if (!hadTabIndex) target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: "start" });
          if (!hadTabIndex) {
            target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
          }
          return;
        }
      }

      if (navigationType === "pop") {
        let focusTarget = restoreState?.focusId
          ? document.getElementById(restoreState.focusId)
          : null;
        if (!focusTarget && restoreState?.focusUrl) {
          focusTarget = [...document.querySelectorAll("a[href]")]
            .find((anchor) => anchor.href === restoreState.focusUrl);
        }
        focusTarget?.focus?.({ preventScroll: true });
        scrollTo(Number(restoreState?.scrollX) || 0, Number(restoreState?.scrollY) || 0);
        if (!focusTarget) routeNode(document, "main")?.focus({ preventScroll: true });
        return;
      }

      routeNode(document, "main")?.focus({ preventScroll: true });
      scrollTo(0, 0);
    } finally {
      root.style.scrollBehavior = previousScrollBehavior;
    }
  };

  const applyRoute = (incomingDocument, targetUrl, { navigationType, restoreState }) => {
    const { incomingHeader, incomingMain, incomingFooter } = validateIncomingDocument(incomingDocument);
    const currentHeader = routeNode(document, "header");
    const currentMain = routeNode(document, "main");
    const currentFooter = routeNode(document, "footer");
    if (!currentHeader || !currentMain || !currentFooter) throw new Error("Current POVKH LAB route regions are incomplete");

    const incomingSkip = routeNode(incomingDocument, "skip");
    const currentSkip = routeNode(document, "skip");
    site.player?.closePlaylist({ restoreFocus: false });
    document.dispatchEvent(new CustomEvent("povkh:routebeforechange", {
      detail: { url: targetUrl.href, navigationType }
    }));
    site.disposeRoute?.();

    updateHead(incomingDocument, targetUrl);
    document.documentElement.lang = incomingDocument.documentElement.lang;
    if (incomingDocument.documentElement.hasAttribute("dir")) {
      document.documentElement.dir = incomingDocument.documentElement.dir;
    } else {
      document.documentElement.removeAttribute("dir");
    }
    document.documentElement.dataset.siteBase = incomingDocument.documentElement.dataset.siteBase || "";
    copyBodyContract(incomingDocument.body);
    currentHeader.replaceWith(safeRouteClone(incomingHeader));
    currentMain.replaceWith(safeRouteClone(incomingMain));
    currentFooter.replaceWith(safeRouteClone(incomingFooter));
    if (incomingSkip && currentSkip) currentSkip.replaceWith(safeRouteClone(incomingSkip));
    site.player?.syncLocaleFrom(incomingDocument);
    site.initRoute?.();
    focusForRoute({ targetUrl, navigationType, restoreState });
    document.dispatchEvent(new CustomEvent("povkh:routechange", {
      detail: { url: targetUrl.href, navigationType }
    }));
  };

  const fallbackNavigation = (url, navigationType) => {
    if (navigationType === "pop") location.reload();
    else location.assign(url.href);
  };

  const navigate = async (urlLike, {
    navigationType = "push",
    restoreState = null
  } = {}) => {
    const requestedUrl = urlLike instanceof URL ? urlLike : new URL(urlLike, location.href);
    if (requestedUrl.origin !== location.origin || !withinSiteBase(requestedUrl.pathname)) {
      fallbackNavigation(requestedUrl, navigationType);
      return false;
    }

    navigationController?.abort();
    navigationController = new AbortController();
    const sequence = ++navigationSequence;
    navigating = true;
    document.documentElement.dataset.routeState = "loading";
    routeNode(document, "main")?.setAttribute("aria-busy", "true");

    try {
      const { incomingDocument, targetUrl } = await fetchRoute(requestedUrl, navigationController.signal);
      validateIncomingDocument(incomingDocument);
      if (sequence !== navigationSequence) return false;

      if (navigationType === "push") {
        history.pushState(routeState({ scrollX: 0, scrollY: 0, focusId: null, focusUrl: null }), "", targetUrl.href);
      } else if (navigationType === "replace") {
        history.replaceState(routeState({ scrollX: 0, scrollY: 0, focusId: null, focusUrl: null }), "", targetUrl.href);
      } else if (targetUrl.href !== location.href) {
        history.replaceState(restoreState || routeState(), "", targetUrl.href);
      }

      applyRoute(incomingDocument, targetUrl, { navigationType, restoreState });
      return true;
    } catch (error) {
      if (error?.name === "AbortError" || sequence !== navigationSequence) return false;
      fallbackNavigation(requestedUrl, navigationType);
      return false;
    } finally {
      if (sequence === navigationSequence) {
        navigating = false;
        routeNode(document, "main")?.removeAttribute("aria-busy");
        delete document.documentElement.dataset.routeState;
        scheduleHistoryPersist();
      }
    }
  };

  router.navigate = navigate;
  normalizePersistentResourceUrls();
  history.scrollRestoration = "manual";
  persistHistoryEntry();

  document.addEventListener("click", (event) => {
    const candidate = eligibleLink(event);
    if (!candidate) return;
    const { url } = candidate;
    const sameDocument = url.pathname === location.pathname && url.search === location.search;
    if (sameDocument && url.hash) return;
    event.preventDefault();
    if (sameDocument) {
      routeNode(document, "main")?.focus({ preventScroll: true });
      scrollTo(0, 0);
      return;
    }
    persistHistoryEntry();
    void navigate(url, { navigationType: "push" });
  });
  window.addEventListener("popstate", (event) => {
    void navigate(new URL(location.href), {
      navigationType: "pop",
      restoreState: event.state && typeof event.state === "object" ? event.state : null
    });
  });
  window.addEventListener("scroll", scheduleHistoryPersist, { passive: true });
  document.addEventListener("focusin", scheduleHistoryPersist);
  window.addEventListener("pagehide", () => {
    if (historyFrame) cancelAnimationFrame(historyFrame);
    persistHistoryEntry();
    navigationController?.abort();
  }, { once: true });
})();

export const hasValidStreamingServiceOrder = (services) => services.length === 3
  && services[0] === "appleMusic"
  && services[1] === "spotify"
  && ["youtubeMusic", "amazonMusic"].includes(services[2]);

const hasOnlyQueryKeys = (url, expectedKeys) => {
  const actualKeys = [...url.searchParams.keys()];
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
};

const serviceRules = {
  appleMusic: (url) => url.hostname === "music.apple.com"
    && /^\/[a-z]{2}\/album\/[a-z0-9%().-]+\/\d+$/.test(url.pathname)
    && hasOnlyQueryKeys(url, ["i"])
    && /^\d{7,12}$/.test(url.searchParams.get("i") || ""),
  spotify: (url) => url.hostname === "open.spotify.com"
    && /^\/track\/[A-Za-z0-9]{22}$/.test(url.pathname)
    && hasOnlyQueryKeys(url, []),
  youtubeMusic: (url) => url.hostname === "music.youtube.com"
    && url.pathname === "/watch"
    && hasOnlyQueryKeys(url, ["v"])
    && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") || ""),
  amazonMusic: (url) => url.hostname === "music.amazon.com"
    && /^\/albums\/[A-Z0-9]{10}$/.test(url.pathname)
    && hasOnlyQueryKeys(url, [])
};

export const isOfficialStreamingUrl = (service, value) => {
  let url;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:"
    && !url.username
    && !url.password
    && !url.port
    && !url.hash
    && Boolean(serviceRules[service]?.(url));
};

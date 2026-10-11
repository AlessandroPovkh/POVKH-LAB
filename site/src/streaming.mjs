export const STREAMING_SERVICES = Object.freeze([
  "appleMusic", "spotify", "youtubeMusic", "amazonMusic", "yandexMusic", "vkMusic", "kionMusic"
]);

export const hasValidStreamingServiceOrder = (services) => Array.isArray(services)
  && services.length >= 1
  && services.length <= STREAMING_SERVICES.length
  && services.every((service, index) => STREAMING_SERVICES.includes(service)
    && (index === 0 || STREAMING_SERVICES.indexOf(service) > STREAMING_SERVICES.indexOf(services[index - 1])));

const hasOnlyQueryKeys = (url, expectedKeys) => {
  const actualKeys = [...url.searchParams.keys()];
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
};

const serviceRules = {
  appleMusic: (url) => url.hostname === "music.apple.com"
    && /^\/[a-z]{2}\/album\/[^/?#]+\/\d+$/.test(url.pathname)
    && (hasOnlyQueryKeys(url, []) || (hasOnlyQueryKeys(url, ["i"])
      && /^\d{7,12}$/.test(url.searchParams.get("i") || ""))),
  spotify: (url) => url.hostname === "open.spotify.com"
    && /^\/(?:track|album)\/[A-Za-z0-9]{22}$/.test(url.pathname)
    && hasOnlyQueryKeys(url, []),
  youtubeMusic: (url) => url.hostname === "music.youtube.com"
    && url.pathname === "/watch"
    && hasOnlyQueryKeys(url, ["v"])
    && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") || ""),
  amazonMusic: (url) => ["music.amazon.com", "music.amazon.ca"].includes(url.hostname)
    && /^\/albums\/[A-Z0-9]{10}$/.test(url.pathname)
    && hasOnlyQueryKeys(url, []),
  yandexMusic: (url) => url.hostname === "music.yandex.ru"
    && /^\/album\/[1-9]\d*$/.test(url.pathname)
    && hasOnlyQueryKeys(url, []),
  vkMusic: (url) => url.hostname === "music.vk.com"
    && /^\/link\/[A-Za-z0-9]{1,64}$/.test(url.pathname)
    && hasOnlyQueryKeys(url, []),
  kionMusic: (url) => url.hostname === "music.mts.ru"
    && /^\/album\/[1-9]\d*$/.test(url.pathname)
    && hasOnlyQueryKeys(url, [])
};

export const isOfficialStreamingUrl = (service, value) => {
  if (typeof service !== "string" || !Object.hasOwn(serviceRules, service)) return false;
  if (!(value instanceof URL) && (typeof value !== "string" || value !== value.trim() || /[\u0000-\u0020\u007f\\]/.test(value))) return false;
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
    && serviceRules[service](url);
};

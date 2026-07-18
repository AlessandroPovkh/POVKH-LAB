const rawMode = process.env.POVKH_SITE_MODE || "preview";
const rawOrigin = process.env.POVKH_SITE_ORIGIN || "https://povkh-lab.example";
const rawBasePath = process.env.POVKH_SITE_BASE_PATH || "";

if (!/^(preview|production)$/.test(rawMode)) {
  throw new Error("POVKH_SITE_MODE must be preview or production");
}

let parsedOrigin;
try {
  parsedOrigin = new URL(rawOrigin);
} catch {
  throw new Error("POVKH_SITE_ORIGIN must be an absolute URL");
}
if (!/^https?:$/.test(parsedOrigin.protocol)
  || parsedOrigin.pathname !== "/"
  || parsedOrigin.search
  || parsedOrigin.hash) {
  throw new Error("POVKH_SITE_ORIGIN must be an http(s) origin without a path, query or hash");
}
if (rawMode === "production" && (parsedOrigin.protocol !== "https:" || parsedOrigin.hostname.endsWith(".example"))) {
  throw new Error("Production requires an approved HTTPS origin outside the reserved .example domain");
}
if (rawBasePath && !/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(rawBasePath)) {
  throw new Error("POVKH_SITE_BASE_PATH must be empty or a root-relative path without a trailing slash");
}

export const SITE_MODE = rawMode;
export const IS_PRODUCTION = rawMode === "production";
export const SITE_ORIGIN = parsedOrigin.origin;
export const SITE_BASE_PATH = rawBasePath;
export const SITE_STATUS = IS_PRODUCTION ? "live" : "prelaunch";
export const ROBOTS_CONTENT = IS_PRODUCTION
  ? "index, follow, max-image-preview:large"
  : "noindex, nofollow";
export const OG_IMAGE_PATH = process.env.POVKH_OG_IMAGE || "/assets/og/povkh-lab-og.png";

if (!/^\/assets\/[A-Za-z0-9._~/-]+\.(?:png|jpg|jpeg|webp)$/.test(OG_IMAGE_PATH)) {
  throw new Error("POVKH_OG_IMAGE must be a root-relative raster asset path");
}

export const CONTACT_EMAIL = (process.env.POVKH_CONTACT_EMAIL || "alessandropovkh@icloud.com").trim();
if (CONTACT_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(CONTACT_EMAIL)) {
  throw new Error("POVKH_CONTACT_EMAIL is invalid");
}
if (IS_PRODUCTION && !CONTACT_EMAIL) {
  throw new Error("Production requires an approved POVKH_CONTACT_EMAIL");
}

const socialDefinitions = [
  ["telegram", "Telegram", "POVKH_SOCIAL_TELEGRAM", "https://t.me/povkhlab"],
  ["tiktok", "TikTok", "POVKH_SOCIAL_TIKTOK", "https://www.tiktok.com/@povkh_lab_recordings"],
  ["instagram", "Instagram", "POVKH_SOCIAL_INSTAGRAM"],
  ["youtube", "YouTube", "POVKH_SOCIAL_YOUTUBE", "https://www.youtube.com/@POVKH_LAB"],
  ["soundcloud", "SoundCloud", "POVKH_SOCIAL_SOUNDCLOUD"]
];

export const SOCIAL_LINKS = socialDefinitions.flatMap(([id, label, environmentKey, approvedDefault = ""]) => {
  const value = (process.env[environmentKey] || approvedDefault).trim();
  if (!value) return [];
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${environmentKey} must be an absolute HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${environmentKey} must be an absolute HTTPS URL without credentials`);
  }
  return [{ id, label, url: url.href }];
});

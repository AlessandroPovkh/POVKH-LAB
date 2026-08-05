import assert from "node:assert/strict";
import test from "node:test";
import { SOCIAL_LINKS } from "../src/config.mjs";
import { resolveSocialLinks } from "../src/social-links.mjs";

const definitions = [
  ["telegram", "Telegram", "SOCIAL_TELEGRAM", "https://t.me/povkhlab"],
  ["tiktok", "TikTok", "SOCIAL_TIKTOK", "https://www.tiktok.com/@povkh_lab_recordings"],
  ["instagram", "Instagram", "SOCIAL_INSTAGRAM"],
  ["youtube", "YouTube", "SOCIAL_YOUTUBE", "https://www.youtube.com/@POVKH_LAB"],
  ["soundcloud", "SoundCloud", "SOCIAL_SOUNDCLOUD"]
];

test("publishes the approved POVKH LAB Instagram destination by default", () => {
  assert.deepEqual(SOCIAL_LINKS.map(({ id }) => id), ["telegram", "tiktok", "instagram", "youtube"]);
  assert.equal(
    SOCIAL_LINKS.find(({ id }) => id === "instagram")?.url,
    "https://www.instagram.com/povkh_lab/"
  );
});

test("keeps approved defaults in deterministic definition order", () => {
  assert.deepEqual(resolveSocialLinks({ definitions, environment: {}, production: false }), [
    { id: "telegram", label: "Telegram", url: "https://t.me/povkhlab" },
    { id: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@povkh_lab_recordings" },
    { id: "youtube", label: "YouTube", url: "https://www.youtube.com/@POVKH_LAB" }
  ]);
});

test("omits explicitly blank optional or default channels", () => {
  const links = resolveSocialLinks({
    definitions,
    environment: { SOCIAL_TELEGRAM: "", SOCIAL_INSTAGRAM: "  " },
    production: false
  });
  assert.deepEqual(links.map(({ id }) => id), ["tiktok", "youtube"]);
});

test("accepts a verified optional HTTPS destination", () => {
  const links = resolveSocialLinks({
    definitions,
    environment: { SOCIAL_INSTAGRAM: "https://www.instagram.com/povkh_lab/" },
    production: false
  });
  assert.equal(links.find(({ id }) => id === "instagram")?.url, "https://www.instagram.com/povkh_lab/");
});

test("rejects non-HTTPS destinations and embedded credentials", () => {
  assert.throws(() => resolveSocialLinks({
    definitions,
    environment: { SOCIAL_INSTAGRAM: "http://instagram.com/povkh_lab" },
    production: false
  }), /SOCIAL_INSTAGRAM must be an absolute HTTPS URL without credentials/);
  assert.throws(() => resolveSocialLinks({
    definitions,
    environment: { SOCIAL_INSTAGRAM: "https://user:secret@instagram.com/povkh_lab" },
    production: false
  }), /SOCIAL_INSTAGRAM must be an absolute HTTPS URL without credentials/);
});

test("rejects duplicate IDs and normalized destinations", () => {
  assert.throws(() => resolveSocialLinks({
    definitions: [...definitions, ["telegram", "Duplicate", "DUPLICATE"]],
    environment: {},
    production: false
  }), /Social link IDs must be unique/);
  assert.throws(() => resolveSocialLinks({
    definitions,
    environment: { SOCIAL_TIKTOK: "https://t.me/povkhlab" },
    production: false
  }), /Social link destinations must be unique/);
});

test("fails closed when production has no verified destination", () => {
  const environment = Object.fromEntries(definitions.map(([, , key]) => [key, ""]));
  assert.throws(() => resolveSocialLinks({ definitions, environment, production: true }), /Production links page requires at least one verified social destination/);
});

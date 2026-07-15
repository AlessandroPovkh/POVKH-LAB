import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPages } from "../src/pages.mjs";
import { hasValidStreamingServiceOrder, isOfficialStreamingUrl } from "../src/streaming.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(siteRoot, "dist");
const stageDir = path.join(siteRoot, `.dist-stage-${process.pid}`);
const backupDir = path.join(siteRoot, `.dist-backup-${process.pid}`);

const validateStreamingLinks = (release) => {
  if (!Array.isArray(release.streamingLinks) || release.streamingLinks.length !== 3) {
    throw new Error(`${release.id} published release must contain exactly three verified streaming links`);
  }
  const services = release.streamingLinks.map((link) => link?.service);
  if (!hasValidStreamingServiceOrder(services)) {
    throw new Error(`${release.id} streaming order must be Apple Music, Spotify and one verified third service`);
  }
  if (new Set(services).size !== services.length) throw new Error(`${release.id} streaming services must be unique`);
  const urls = new Set();
  for (const link of release.streamingLinks) {
    if (!link || JSON.stringify(Object.keys(link).sort()) !== JSON.stringify(["service", "url"])) {
      throw new Error(`${release.id} streaming links must contain only service and url`);
    }
    if (!isOfficialStreamingUrl(link.service, link.url)) {
      throw new Error(`${release.id} ${link.service} URL does not match its official service`);
    }
    if (urls.has(link.url)) throw new Error(`${release.id} streaming URLs must be unique`);
    urls.add(link.url);
  }
};

const readCatalog = async () => {
  const raw = await readFile(path.join(siteRoot, "data", "catalog.json"), "utf8");
  const catalog = JSON.parse(raw);

  if (catalog.schemaVersion !== 2 || !Array.isArray(catalog.releases)) {
    throw new Error("catalog.json must use schemaVersion 2 and contain a releases array");
  }
  const snapshotDateObject = new Date(`${catalog.asOf}T23:59:59Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog.asOf || "") || Number.isNaN(snapshotDateObject.valueOf()) || snapshotDateObject.toISOString().slice(0, 10) !== catalog.asOf) {
    throw new Error("catalog.json asOf must be a valid ISO snapshot date");
  }
  if (!catalog.label || catalog.label.officialName !== "Povkh Lab Recordings" || catalog.label.publicMark !== "POVKH LAB") {
    throw new Error("catalog.json must contain the approved official label name and public mark");
  }
  if (catalog.label.founded !== 2025 || catalog.label.location !== "Brescia (BS), Italia" || catalog.label.founder !== "Aleksandr Babenko (Povkh)") {
    throw new Error("catalog.json label facts do not match the approved founder, year or location");
  }
  if (catalog.releases.length !== 13) {
    throw new Error("Approved catalog must contain exactly 13 releases");
  }

  const seenSlugs = new Set();
  const seenTuneCoreIds = new Set();
  const snapshotDate = Date.parse(`${catalog.asOf}T23:59:59Z`);
  for (const [index, release] of catalog.releases.entries()) {
    const sequence = String(index + 1).padStart(3, "0");
    const expectedId = `PVKH-${sequence}`;
    const expectedSlug = `pvkh-${sequence}`;
    if (release.id !== expectedId || release.slug !== expectedSlug) {
      throw new Error(`Catalog position ${index + 1} must be ${expectedId} / ${expectedSlug}`);
    }
    if (seenSlugs.has(release.slug)) throw new Error(`Duplicate release slug: ${release.slug}`);
    seenSlugs.add(release.slug);
    if (!/^(published|upcoming)$/.test(release.status) || release.public !== true) {
      throw new Error(`${release.id} must be public and marked published or upcoming`);
    }
    for (const field of ["artistCredit", "title", "tuneCoreId", "releaseDate"]) {
      if (typeof release[field] !== "string" || !release[field].trim()) {
        throw new Error(`${release.id} ${field} must be a non-empty string`);
      }
    }
    if (!Array.isArray(release.artists) || release.artists.length < 1 || release.artists.some((artist) => typeof artist !== "string" || !artist.trim())) {
      throw new Error(`${release.id} artists must contain at least one canonical artist name`);
    }
    if (release.artistCredit !== release.artists.join(" & ")) {
      throw new Error(`${release.id} artistCredit must be derived from artists with an ampersand separator`);
    }
    if (seenTuneCoreIds.has(release.tuneCoreId)) throw new Error(`Duplicate TuneCore ID: ${release.tuneCoreId}`);
    seenTuneCoreIds.add(release.tuneCoreId);
    if (!/^\d+$/.test(release.tuneCoreId)) throw new Error(`${release.id} TuneCore ID must contain digits only`);
    if (typeof release.tuneCoreIdNeedsOwnerVerification !== "boolean") {
      throw new Error(`${release.id} must declare whether its internal TuneCore ID needs owner verification`);
    }
    const releaseDateObject = new Date(`${release.releaseDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate) || Number.isNaN(releaseDateObject.valueOf()) || releaseDateObject.toISOString().slice(0, 10) !== release.releaseDate) {
      throw new Error(`${release.id} releaseDate must be a valid ISO date`);
    }
    const releaseTime = Date.parse(`${release.releaseDate}T00:00:00Z`);
    if (release.status === "published" && releaseTime > snapshotDate) {
      throw new Error(`${release.id} cannot be published after the catalog snapshot`);
    }
    if (release.status === "upcoming" && releaseTime <= snapshotDate) {
      throw new Error(`${release.id} cannot be upcoming on or before the catalog snapshot`);
    }
    if (!Array.isArray(release.formats) || release.formats.length !== 1 || release.formats[0] !== "digital") {
      throw new Error(`${release.id} must use the approved digital format`);
    }
    if (release.primaryGenre !== null && (typeof release.primaryGenre !== "string" || !release.primaryGenre.trim())) {
      throw new Error(`${release.id} primaryGenre must be null or a non-empty verified platform genre`);
    }
    if (release.status === "published" && !release.primaryGenre) {
      throw new Error(`${release.id} published release must include its verified primary platform genre`);
    }
    if (!Array.isArray(release.editorialTags) || release.editorialTags.some((tag) => typeof tag !== "string" || !tag.trim())) {
      throw new Error(`${release.id} editorialTags must be an array of non-empty strings`);
    }
    if (!release.editorial || typeof release.editorial.contentBasis !== "string" || typeof release.editorial.genreBasis !== "string" || typeof release.editorial.reviewRequired !== "boolean") {
      throw new Error(`${release.id} must preserve editorial content and genre provenance`);
    }
    if (!Array.isArray(release.tracks) || release.tracks.length !== 1 || release.trackCount !== 1) {
      throw new Error(`${release.id} must contain exactly one track`);
    }
    if (release.tracks[0].title !== release.title) throw new Error(`${release.id} track title must match the single title`);
    if (release.tracks[0].duration !== null && !/^\d+:[0-5]\d$/.test(release.tracks[0].duration)) {
      throw new Error(`${release.id} track duration must be null or M:SS`);
    }
    if (release.status === "published") {
      validateStreamingLinks(release);
    }
    if (Object.hasOwn(release, "listenUrl")) {
      throw new Error(`${release.id} uses the removed single-service listenUrl field`);
    }
    if (release.status === "upcoming" && release.streamingLinks !== null) {
      throw new Error(`${release.id} upcoming release must not expose unverified streaming links`);
    }
    if (release.status === "published" && (release.preorderDate !== null || release.preorderUrl !== null)) {
      throw new Error(`${release.id} historical preorder data must remain omitted when it is not officially verified`);
    }
    if (release.status === "upcoming") {
      const preorderDateObject = new Date(`${release.preorderDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(release.preorderDate || "") || Number.isNaN(preorderDateObject.valueOf()) || preorderDateObject.toISOString().slice(0, 10) !== release.preorderDate) {
        throw new Error(`${release.id} upcoming release needs a valid ISO preorder date`);
      }
      if (Date.parse(`${release.preorderDate}T00:00:00Z`) >= releaseTime) throw new Error(`${release.id} preorder must start before release`);
      if (release.preorderUrl !== null) {
        let preorderUrl;
        try {
          preorderUrl = new URL(release.preorderUrl);
        } catch {
          throw new Error(`${release.id} preorderUrl must be null or a valid URL`);
        }
        if (preorderUrl.protocol !== "https:" || !preorderUrl.hostname) throw new Error(`${release.id} preorder URL must use HTTPS`);
        if (snapshotDate < Date.parse(`${release.preorderDate}T00:00:00Z`)) throw new Error(`${release.id} preorder URL cannot be public before the planned preorder date`);
      }
    }
    for (const locale of ["en", "it", "ru"]) {
      const localized = release.content?.[locale];
      for (const field of ["short", "story", "mood", "audience"]) {
        if (typeof localized?.[field] !== "string" || !localized[field].trim()) {
          throw new Error(`${release.id} content.${locale}.${field} must be a non-empty string`);
        }
      }
    }
  }

  return catalog;
};

const listFiles = async (dir, base = dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute, base));
    if (entry.isFile()) files.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return files;
};

const hashFile = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");

const exists = async (target) => {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};

const writePage = async (relative, html) => {
  const output = path.join(stageDir, relative);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, html, "utf8");
};

const build = async () => {
  const catalog = await readCatalog();
  await rm(stageDir, { recursive: true, force: true });
  await rm(backupDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  const pages = createPages(catalog);
  const smartLinkPageCount = catalog.releases.filter((release) => release.streamingLinks).length;
  const expectedPageCount = 3 * (catalog.releases.length + 9 + smartLinkPageCount);
  if (pages.size !== expectedPageCount) {
    throw new Error(`The localized site must contain exactly ${expectedPageCount} HTML pages; received ${pages.size}`);
  }
  for (const [relative, html] of pages) {
    await writePage(relative, html);
  }

  await cp(path.join(siteRoot, "assets"), path.join(stageDir, "assets"), { recursive: true });
  await mkdir(path.join(stageDir, "assets", "motion"), { recursive: true });
  for (const filename of [
    "PVKH_MOTION_BLOB_SOUND_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_SOUND_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_PROCESS_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_PROCESS_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_ARCHIVE_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_ARCHIVE_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_TEAM_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_TEAM_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_ORIGIN_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_ORIGIN_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_SIGNAL_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_SIGNAL_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_LINK_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_LINK_1920x1080_v1.mp4",
    "PVKH_MOTION_BLOB_PRIME_1920x1080_v1.webm",
    "PVKH_MOTION_BLOB_PRIME_1920x1080_v1.mp4",
    "PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.webm",
    "PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.mp4"
  ]) {
    await cp(
      path.join(siteRoot, "..", "media", "motion", "exports", filename),
      path.join(stageDir, "assets", "motion", filename)
    );
  }
  await mkdir(path.join(stageDir, "downloads"), { recursive: true });
  await cp(
    path.join(siteRoot, "..", "exports", "POVKH-LAB-Brand-Board-v1.0.pdf"),
    path.join(stageDir, "downloads", "POVKH-LAB-Brand-Board-v1.0.pdf"),
  );
  await writeFile(path.join(stageDir, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");
  for (const { locale, directory } of [
    { locale: "en", directory: "" },
    { locale: "it", directory: "it" },
    { locale: "ru", directory: "ru" }
  ]) {
    const manifestDir = path.join(stageDir, directory);
    await mkdir(manifestDir, { recursive: true });
    await writeFile(path.join(manifestDir, "site.webmanifest"), `${JSON.stringify({
      name: "POVKH LAB",
      short_name: "POVKH LAB",
      lang: locale,
      start_url: "./",
      display: "standalone",
      background_color: "#080808",
      theme_color: "#080808",
      icons: [{
        src: `${directory ? "../" : ""}assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg`,
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }]
    }, null, 2)}\n`, "utf8");
  }

  const files = (await listFiles(stageDir)).filter((file) => file !== "build-manifest.json");
  const manifest = {
    schemaVersion: 1,
    generatedFrom: [
      "data/catalog.json",
      "src/pages.mjs",
      "src/i18n.mjs",
      "assets/",
      "../media/motion/exports/PVKH_MOTION_BLOB_SOUND_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_SOUND_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_PROCESS_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_PROCESS_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_ARCHIVE_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_ARCHIVE_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_TEAM_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_TEAM_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_ORIGIN_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_ORIGIN_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_SIGNAL_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_SIGNAL_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_LINK_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_LINK_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_BLOB_PRIME_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_BLOB_PRIME_1920x1080_v1.mp4",
      "../media/motion/exports/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.webm",
      "../media/motion/exports/PVKH_MOTION_AMBIENT_FIELD_1280x720_v1.mp4",
      "../exports/POVKH-LAB-Brand-Board-v1.0.pdf",
    ],
    files: {}
  };
  for (const file of files) {
    manifest.files[file] = await hashFile(path.join(stageDir, file));
  }
  await writeFile(path.join(stageDir, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  let movedOldDist = false;
  try {
    if (await exists(distDir)) {
      await rename(distDir, backupDir);
      movedOldDist = true;
    }
    await rename(stageDir, distDir);
    await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    await rm(distDir, { recursive: true, force: true });
    if (movedOldDist && await exists(backupDir)) await rename(backupDir, distDir);
    throw error;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }

  console.log(`POVKH LAB site built: ${files.length + 1} files in ${distDir}`);
};

await build();

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
import {
  IS_PRODUCTION,
  OG_IMAGE_PATH,
  SITE_BASE_PATH,
  SITE_MODE,
  SITE_ORIGIN
} from "../src/config.mjs";
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
    if (!/^(?:en|ru)$/.test(release.titleLanguage || "")) {
      throw new Error(`${release.id} titleLanguage must be en or ru`);
    }
    const expectedTitleLanguage = release.id === "PVKH-013" ? "ru" : "en";
    if (release.titleLanguage !== expectedTitleLanguage) {
      throw new Error(`${release.id} titleLanguage must be ${expectedTitleLanguage}`);
    }
    if (!Array.isArray(release.artists) || release.artists.length < 1 || release.artists.some((artist) => typeof artist !== "string" || !artist.trim())) {
      throw new Error(`${release.id} artists must contain at least one canonical artist name`);
    }
    if (release.artwork !== null && !/^assets\/releases\/[a-z0-9-]+\.webp$/.test(release.artwork || "")) {
      throw new Error(`${release.id} artwork must be null or a safe approved WebP asset path`);
    }
    if (release.artwork && !await exists(path.join(siteRoot, release.artwork))) {
      throw new Error(`${release.id} artwork is missing: ${release.artwork}`);
    }
    if (!await exists(path.join(siteRoot, "assets", "releases", "signals", `${release.slug}.svg`))) {
      throw new Error(`${release.id} fallback signal visual is missing`);
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

const readArtistLibrary = async (catalog) => {
  const library = JSON.parse(await readFile(path.join(siteRoot, "data", "artists.json"), "utf8"));
  if (library.schemaVersion !== 1 || !Array.isArray(library.artists) || library.artists.length < 1) {
    throw new Error("artists.json must use schemaVersion 1 and contain an artists array");
  }
  const names = new Set();
  const slugs = new Set();
  const artistSocialHosts = new Map([
    ["Instagram", "www.instagram.com"],
    ["Telegram", "t.me"],
    ["TikTok", "www.tiktok.com"],
    ["YouTube", "www.youtube.com"]
  ]);
  for (const artist of library.artists) {
    if (typeof artist.name !== "string" || !artist.name.trim() || names.has(artist.name)) throw new Error("Every artist must have a unique canonical name");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artist.slug || "") || slugs.has(artist.slug)) throw new Error(`${artist.name} must have a unique safe slug`);
    if (artist.bio !== null || !Array.isArray(artist.links)) throw new Error(`${artist.name} must keep unapproved bio null and links explicit`);
    const linkServices = new Set();
    for (const link of artist.links) {
      if (!link || typeof link !== "object" || Array.isArray(link) || Object.keys(link).sort().join(",") !== "service,url") {
        throw new Error(`${artist.name} links must contain only service and url`);
      }
      if (!artistSocialHosts.has(link.service) || linkServices.has(link.service)) {
        throw new Error(`${artist.name} has an unsupported or duplicate social service`);
      }
      let socialUrl;
      try {
        socialUrl = new URL(link.url);
      } catch {
        throw new Error(`${artist.name} has an invalid ${link.service} URL`);
      }
      if (socialUrl.protocol !== "https:" || socialUrl.hostname !== artistSocialHosts.get(link.service) || socialUrl.username || socialUrl.password) {
        throw new Error(`${artist.name} has an invalid ${link.service} URL`);
      }
      linkServices.add(link.service);
    }
    if (artist.portrait !== null && !/^assets\/artists\/[a-z0-9-]+\.webp$/.test(artist.portrait || "")) throw new Error(`${artist.name} portrait must be null or a safe WebP path`);
    if (artist.portrait && !await exists(path.join(siteRoot, artist.portrait))) throw new Error(`${artist.name} portrait is missing: ${artist.portrait}`);
    if (!Array.isArray(artist.gallery) || artist.gallery.length > 24) throw new Error(`${artist.name} gallery must be an explicit array with at most 24 photos`);
    if ((artist.gallery[0] || null) !== artist.portrait) throw new Error(`${artist.name} portrait must be the first gallery photo`);
    const galleryPhotos = new Set();
    for (const photo of artist.gallery) {
      if (!/^assets\/artists\/[a-z0-9-]+\.webp$/.test(photo || "") || galleryPhotos.has(photo)) {
        throw new Error(`${artist.name} gallery photos must be unique safe WebP paths`);
      }
      if (!await exists(path.join(siteRoot, photo))) throw new Error(`${artist.name} gallery photo is missing: ${photo}`);
      galleryPhotos.add(photo);
    }
    names.add(artist.name);
    slugs.add(artist.slug);
  }
  const catalogNames = new Set(catalog.releases.flatMap((release) => release.artists));
  if (names.size !== catalogNames.size || [...catalogNames].some((name) => !names.has(name))) {
    throw new Error("artists.json must exactly match the confirmed catalog roster");
  }
  return library;
};

const readAudioLibrary = async (catalog) => {
  const raw = await readFile(path.join(siteRoot, "data", "audio-library.json"), "utf8");
  const library = JSON.parse(raw);
  const format = library.format;
  if (library.schemaVersion !== 1
    || !Array.isArray(library.tracks)
    || library.tracks.length !== catalog.releases.length
    || format?.container !== "mp3"
    || format?.codec !== "mp3"
    || format?.sampleRate !== 48000
    || format?.bitRate !== 192000
    || format?.masterBitRate !== 320000
    || format?.channels !== 2
    || format?.waveformPoints !== 160) {
    throw new Error("audio-library.json must define 320 kbps masters, 192 kbps streaming copies, 48 kHz stereo and 160-point waveforms");
  }

  const files = new Set();
  const waveforms = new Set();
  for (const [index, track] of library.tracks.entries()) {
    const release = catalog.releases[index];
    if (track.catalogId !== release.id) {
      throw new Error(`Audio position ${index + 1} must match ${release.id}`);
    }
    if (!/^pvkh-\d{3}-[a-z0-9-]+\.mp3$/.test(track.file || "") || files.has(track.file)) {
      throw new Error(`${track.catalogId} must use a unique safe MP3 filename`);
    }
    if (!/^pvkh-\d{3}-[a-z0-9-]+\.waveform\.json$/.test(track.waveform || "") || waveforms.has(track.waveform)) {
      throw new Error(`${track.catalogId} must use a unique safe waveform filename`);
    }
    if (!Number.isFinite(track.duration) || track.duration <= 0) {
      throw new Error(`${track.catalogId} must declare a positive duration`);
    }
    files.add(track.file);
    waveforms.add(track.waveform);

    const source = path.join(siteRoot, "..", "Tracks", track.file);
    if (!await exists(source)) throw new Error(`${track.catalogId} source is missing: Tracks/${track.file}`);
    const streamingSource = path.join(siteRoot, "..", "Tracks", "streaming", track.file);
    if (!await exists(streamingSource)) throw new Error(`${track.catalogId} streaming source is missing: Tracks/streaming/${track.file}`);
    const waveformPath = path.join(siteRoot, "assets", "audio", track.waveform);
    if (!await exists(waveformPath)) throw new Error(`${track.catalogId} waveform is missing: assets/audio/${track.waveform}`);
    const waveform = JSON.parse(await readFile(waveformPath, "utf8"));
    if (waveform.schemaVersion !== 1
      || waveform.source !== track.file
      || Math.abs(waveform.duration - track.duration) > 0.001
      || !Array.isArray(waveform.peaks)
      || waveform.peaks.length !== format.waveformPoints
      || waveform.peaks.some((peak) => !Number.isFinite(peak) || peak < 0 || peak > 1)) {
      throw new Error(`${track.catalogId} waveform data is invalid`);
    }
  }
  if (!library.tracks.some((track) => track.catalogId === library.defaultCatalogId)) {
    throw new Error("audio-library.json defaultCatalogId must identify one playlist track");
  }
  return library;
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

const assertOgImage = async () => {
  if (IS_PRODUCTION && OG_IMAGE_PATH.includes("placeholder")) throw new Error("Production OG image cannot be a placeholder");
  const target = path.join(siteRoot, OG_IMAGE_PATH.slice(1));
  const buffer = await readFile(target);
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error("POVKH_OG_IMAGE must be a PNG so its launch dimensions can be validated");
  }
  if (buffer.readUInt32BE(16) !== 1200 || buffer.readUInt32BE(20) !== 630) {
    throw new Error("POVKH_OG_IMAGE must be exactly 1200x630");
  }
};

const publicUrlForOutput = (relative) => {
  const publicPath = relative === "index.html"
    ? "/"
    : `/${relative.replace(/index\.html$/, "")}`;
  return `${SITE_ORIGIN}${SITE_BASE_PATH}${publicPath}`;
};

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
  const audioLibrary = await readAudioLibrary(catalog);
  const artistLibrary = await readArtistLibrary(catalog);
  await assertOgImage();
  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  const pages = createPages(catalog, audioLibrary, artistLibrary);
  const smartLinkPageCount = catalog.releases.filter((release) => release.streamingLinks).length;
  const expectedPageCount = 3 * (catalog.releases.length + artistLibrary.artists.length + 9 + smartLinkPageCount);
  if (pages.size !== expectedPageCount) {
    throw new Error(`The localized site must contain exactly ${expectedPageCount} HTML pages; received ${pages.size}`);
  }
  for (const [relative, html] of pages) {
    await writePage(relative, html);
  }

  await cp(path.join(siteRoot, "assets"), path.join(stageDir, "assets"), { recursive: true });
  await mkdir(path.join(stageDir, "assets", "tracks"), { recursive: true });
  for (const track of audioLibrary.tracks) {
    await cp(
      path.join(siteRoot, "..", "Tracks", "streaming", track.file),
      path.join(stageDir, "assets", "tracks", track.file)
    );
  }
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
    ...["SOUND", "PROCESS", "ARCHIVE", "TEAM", "ORIGIN", "SIGNAL", "LINK", "PRIME"].flatMap((name) => [
      `PVKH_MOTION_BLOB_${name}_MOBILE_640x360_v1.webm`,
      `PVKH_MOTION_BLOB_${name}_MOBILE_640x360_v1.mp4`
    ]),
    "PVKH_MOTION_LOOP_1920x1080_v1.webm",
    "PVKH_MOTION_LOOP_1920x1080_v1.mp4",
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
  const robots = IS_PRODUCTION
    ? `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}${SITE_BASE_PATH}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  await writeFile(path.join(stageDir, "robots.txt"), robots, "utf8");
  if (IS_PRODUCTION) {
    const urls = [...pages.keys()]
      .filter((relative) => !relative.endsWith("404.html"))
      .map((relative) => `  <url><loc>${publicUrlForOutput(relative)}</loc></url>`)
      .join("\n");
    await writeFile(path.join(stageDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, "utf8");
  }
  await writeFile(path.join(stageDir, ".nojekyll"), "", "utf8");
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
      "data/audio-library.json",
      "data/artists.json",
      `config:${SITE_MODE}`,
      "src/pages.mjs",
      "src/i18n.mjs",
      "assets/",
      "../Tracks/",
      "../Tracks/streaming/",
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
      ...["SOUND", "PROCESS", "ARCHIVE", "TEAM", "ORIGIN", "SIGNAL", "LINK", "PRIME"].flatMap((name) => [
        `../media/motion/exports/PVKH_MOTION_BLOB_${name}_MOBILE_640x360_v1.webm`,
        `../media/motion/exports/PVKH_MOTION_BLOB_${name}_MOBILE_640x360_v1.mp4`
      ]),
      "../media/motion/exports/PVKH_MOTION_LOOP_1920x1080_v1.webm",
      "../media/motion/exports/PVKH_MOTION_LOOP_1920x1080_v1.mp4",
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

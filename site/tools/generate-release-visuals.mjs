import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(siteRoot, "data", "catalog.json"), "utf8"));
const audioLibrary = JSON.parse(await readFile(path.join(siteRoot, "data", "audio-library.json"), "utf8"));
const outputDir = path.join(siteRoot, "assets", "releases", "signals");
const audioByCatalogId = new Map(audioLibrary.tracks.map((track) => [track.catalogId, track]));

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const waveformPath = (points, width, height) => {
  const center = height / 2;
  return points.map((point, index) => {
    const x = (index / Math.max(1, points.length - 1)) * width;
    const y = center - Math.max(-1, Math.min(1, Number(point))) * center;
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
};

await mkdir(outputDir, { recursive: true });
for (const release of catalog.releases) {
  const audio = audioByCatalogId.get(release.id);
  if (!audio) throw new Error(`Missing audio metadata for ${release.id}`);
  const waveformData = JSON.parse(await readFile(path.join(siteRoot, "assets", "audio", audio.waveform), "utf8"));
  const points = waveformData.peaks || waveformData.points;
  if (!Array.isArray(points) || points.length < 2) throw new Error(`Invalid waveform for ${release.id}`);
  const safeId = escapeXml(release.id);
  const safeTitle = escapeXml(release.title.toUpperCase());
  const safeArtist = escapeXml(release.artistCredit.toUpperCase());
  const duration = `${Math.floor(audio.duration / 60)}:${String(Math.floor(audio.duration % 60)).padStart(2, "0")}`;
  const waveform = waveformPath(points, 1180, 340);
  const ticks = Array.from({ length: 13 }, (_, index) => {
    const x = 96 + index * 117;
    return `<path d="M${x} 90v${index % 4 === 0 ? 36 : 16}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1600" role="img" aria-labelledby="title description">
  <title id="title">${safeId} ${safeTitle} signal visual</title>
  <desc id="description">Catalog signal generated from the track waveform. This is not official release artwork.</desc>
  <defs><pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#f2efe8" stroke-opacity=".055"/></pattern></defs>
  <rect width="1600" height="1600" fill="#080808"/><rect width="1600" height="1600" fill="url(#grid)"/>
  <g fill="none" stroke="#f2efe8" stroke-opacity=".28">${ticks}<path d="M96 126H1504M96 1472H1504"/></g>
  <path d="${waveform}" transform="translate(210 640)" fill="none" stroke="#f2efe8" stroke-width="3" vector-effect="non-scaling-stroke"/>
  <path d="${waveform}" transform="translate(210 980) scale(1 -1)" fill="none" stroke="#f32222" stroke-opacity=".6" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  <path d="M96 316H512M96 316V388M1504 1212H1088M1504 1212V1140" fill="none" stroke="#f32222" stroke-width="4"/>
  <g fill="#f2efe8" font-family="monospace"><text x="96" y="222" font-size="42" letter-spacing="8">POVKH LAB / CATALOG SIGNAL</text><text x="96" y="470" font-size="154" font-weight="700">${safeId}</text><text x="96" y="1332" font-size="78" font-weight="700">${safeTitle}</text><text x="96" y="1406" font-size="32" letter-spacing="4" fill-opacity=".72">${safeArtist}</text></g>
  <g fill="#f32222" font-family="monospace" font-size="30"><text x="1262" y="222">${duration}</text><text x="1176" y="1406">WAVEFORM / 160</text></g>
  <text x="96" y="1530" fill="#f2efe8" fill-opacity=".45" font-family="monospace" font-size="22" letter-spacing="3">SYSTEM VISUAL · NOT RELEASE ARTWORK</text>
</svg>`;
  await writeFile(path.join(outputDir, `${release.slug}.svg`), svg, "utf8");
}

console.log(`Generated ${catalog.releases.length} waveform-derived catalog signal visuals.`);

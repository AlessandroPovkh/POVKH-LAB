import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracksRoot = path.join(siteRoot, "..", "Tracks");
const waveformRoot = path.join(siteRoot, "assets", "audio");
const library = JSON.parse(await readFile(path.join(siteRoot, "data", "audio-library.json"), "utf8"));
const pointCount = library.format?.waveformPoints;

if (!Number.isInteger(pointCount) || pointCount < 32) {
  throw new Error("audio-library.json must declare at least 32 waveform points");
}

for (const track of library.tracks) {
  const source = path.join(tracksRoot, track.file);
  const decoded = spawnSync("ffmpeg", [
    "-v", "error",
    "-i", source,
    "-map", "0:a:0",
    "-ac", "1",
    "-ar", "8000",
    "-f", "f32le",
    "pipe:1"
  ], { encoding: null, maxBuffer: 128 * 1024 * 1024 });

  if (decoded.status !== 0) {
    throw new Error(`Could not decode ${track.file}: ${decoded.stderr?.toString().trim() || "ffmpeg failed"}`);
  }
  if (!decoded.stdout?.length || decoded.stdout.length % 4 !== 0) {
    throw new Error(`Decoded PCM for ${track.file} is empty or malformed`);
  }

  const sampleCount = decoded.stdout.length / 4;
  const peaks = Array.from({ length: pointCount }, (_, index) => {
    const start = Math.floor(index * sampleCount / pointCount);
    const end = Math.max(start + 1, Math.floor((index + 1) * sampleCount / pointCount));
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(decoded.stdout.readFloatLE(sampleIndex * 4)));
    }
    return Number(Math.min(1, peak).toFixed(4));
  });

  const waveform = {
    schemaVersion: 1,
    source: track.file,
    duration: track.duration,
    peaks
  };
  await writeFile(path.join(waveformRoot, track.waveform), `${JSON.stringify(waveform, null, 2)}\n`, "utf8");
  console.log(`${track.catalogId}: ${track.waveform}`);
}

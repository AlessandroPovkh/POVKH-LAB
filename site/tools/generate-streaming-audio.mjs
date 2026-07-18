import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracksRoot = path.join(siteRoot, "..", "Tracks");
const outputRoot = path.join(tracksRoot, "streaming");
const stageRoot = path.join(tracksRoot, `.streaming-stage-${process.pid}`);
const library = JSON.parse(await readFile(path.join(siteRoot, "data", "audio-library.json"), "utf8"));
const bitRate = library.format?.bitRate;

if (!Number.isInteger(bitRate) || bitRate < 128000 || bitRate > 256000) {
  throw new Error("audio-library.json streaming bitRate must be between 128000 and 256000");
}

await rm(stageRoot, { recursive: true, force: true });
await mkdir(stageRoot, { recursive: true });

try {
  for (const track of library.tracks) {
    const result = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", path.join(tracksRoot, track.file),
      "-map", "0:a:0", "-vn",
      "-c:a", "libmp3lame",
      "-b:a", `${Math.round(bitRate / 1000)}k`,
      "-ar", String(library.format.sampleRate),
      "-ac", String(library.format.channels),
      "-map_metadata", "0",
      "-id3v2_version", "3",
      "-write_id3v1", "1",
      path.join(stageRoot, track.file)
    ], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`Could not render ${track.catalogId}: ${result.stderr.trim() || "ffmpeg failed"}`);
    }
    console.log(`${track.catalogId}: ${track.file}`);
  }
  await rm(outputRoot, { recursive: true, force: true });
  await rename(stageRoot, outputRoot);
} finally {
  await rm(stageRoot, { recursive: true, force: true });
}

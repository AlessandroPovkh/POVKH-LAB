#!/usr/bin/env node
import { chromium } from '../../tools/node_modules/playwright/index.mjs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'source', 'render.html');
const output = path.join(here, 'exports');
const DEFAULT_FPS = 24;
const scenes = [
  { id: 'ident', width: 1080, height: 1080, duration: 4, fps: DEFAULT_FPS },
  { id: 'transition', width: 1920, height: 1080, duration: 1, fps: DEFAULT_FPS },
  { id: 'loop', width: 1920, height: 1080, duration: 4, fps: DEFAULT_FPS },
  { id: 'blob-sound', width: 1920, height: 1080, duration: 3, fps: 30, word: 'SOUND.', accent: '#F32222' },
  { id: 'blob-process', width: 1920, height: 1080, duration: 3, fps: 30, word: 'PROCESS.', accent: '#46A3FF' },
  { id: 'blob-archive', width: 1920, height: 1080, duration: 3, fps: 30, word: 'ARCHIVE.', accent: '#60E68C' },
  { id: 'blob-team', width: 1920, height: 1080, duration: 3, fps: 30, word: 'TEAM', accent: '#FF4FA3' },
  { id: 'blob-origin', width: 1920, height: 1080, duration: 3, fps: 30, word: 'ORIGIN', accent: '#B47CFF' },
  { id: 'blob-signal', width: 1920, height: 1080, duration: 3, fps: 30, word: 'SIGNAL', accent: '#FFB547' },
  { id: 'blob-link', width: 1920, height: 1080, duration: 3, fps: 30, word: 'LINK', accent: '#36D9E6' },
  { id: 'blob-prime', width: 1920, height: 1080, duration: 3, fps: 30, word: 'PRIME', accent: '#D6FF3F' },
  { id: 'ambient-field', width: 1280, height: 720, duration: 4, fps: DEFAULT_FPS },
  { id: 'lower-third', width: 1920, height: 1080, duration: 4, fps: DEFAULT_FPS },
  { id: 'story', width: 1080, height: 1920, duration: 5, fps: 30 },
];

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function sourceFingerprint() {
  const digest = createHash('sha256');
  for (const file of ['render.html', 'motion.css', 'motion-engine.js']) {
    digest.update(file);
    digest.update(await readFile(path.join(here, 'source', file)));
  }
  return digest.digest('hex');
}

async function ffmpeg(args) {
  await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 10 * 1024 * 1024 });
}

async function encode(frames, target, scene) {
  const input = path.join(frames, 'frame-%04d.png');
  await ffmpeg([
    '-framerate', String(scene.fps), '-i', input, '-frames:v', String(scene.duration * scene.fps), '-an',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-flags:v', '+bitexact', target,
  ]);
}

async function encodeWebm(frames, target, scene) {
  const input = path.join(frames, 'frame-%04d.png');
  await ffmpeg([
    '-framerate', String(scene.fps), '-i', input, '-frames:v', String(scene.duration * scene.fps), '-an',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
    '-cpu-used', '2', '-row-mt', '0', '-threads', '1', '-pix_fmt', 'yuv420p', target,
  ]);
}

async function encodeGif(frames, target, scene) {
  const input = path.join(frames, 'frame-%04d.png');
  const filter = 'fps=12,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3';
  await ffmpeg(['-framerate', String(scene.fps), '-i', input, '-t', String(scene.duration), '-filter_complex', filter, '-loop', '0', target]);
}

const stage = await mkdtemp(path.join(here, '.motion-stage-'));
const framesRoot = await mkdtemp(path.join(tmpdir(), 'povkh-motion-frames-'));
const sourceSha256 = await sourceFingerprint();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const assets = [];
  for (const scene of scenes) {
    const frameDir = path.join(framesRoot, scene.id);
    await mkdir(frameDir, { recursive: true });
    await page.setViewportSize({ width: scene.width, height: scene.height });
    for (let frame = 0; frame < scene.duration * scene.fps; frame += 1) {
      const url = new URL(pathToFileURL(source));
      url.searchParams.set('scene', scene.id);
      url.searchParams.set('time', String(frame / scene.fps));
      if (scene.word) url.searchParams.set('word', scene.word);
      if (scene.accent) url.searchParams.set('accent', scene.accent);
      await page.goto(url.href, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__POVKH_READY__ === true);
      await page.screenshot({ path: path.join(frameDir, `frame-${String(frame).padStart(4, '0')}.png`), animations: 'disabled' });
    }
    const mp4Name = `PVKH_MOTION_${scene.id.toUpperCase().replace('-', '_')}_${scene.width}x${scene.height}_v1.mp4`;
    const mp4Path = path.join(stage, mp4Name);
    await encode(frameDir, mp4Path, scene);
    assets.push({ scene: scene.id, file: mp4Name, width: scene.width, height: scene.height, durationSeconds: scene.duration, fps: scene.fps, format: 'mp4', placeholder: scene.id === 'story' || scene.id === 'lower-third' });
    if (scene.id === 'ident' || scene.id === 'loop' || scene.id.startsWith('blob-') || scene.id === 'ambient-field') {
      const webmName = mp4Name.replace(/\.mp4$/, '.webm');
      await encodeWebm(frameDir, path.join(stage, webmName), scene);
      assets.push({ scene: scene.id, file: webmName, width: scene.width, height: scene.height, durationSeconds: scene.duration, fps: scene.fps, format: 'webm', placeholder: false });
    }
    if (scene.id === 'ident') {
      const gifName = 'PVKH_MOTION_IDENT_PREVIEW_540x540_v1.gif';
      await encodeGif(frameDir, path.join(stage, gifName), scene);
      assets.push({ scene: scene.id, file: gifName, width: 540, height: 540, durationSeconds: scene.duration, fps: 12, format: 'gif', placeholder: false });
      await page.goto(`${pathToFileURL(source).href}?scene=ident&time=1.2`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__POVKH_READY__ === true);
      await page.screenshot({ path: path.join(stage, 'PVKH_MOTION_IDENT_KEYFRAME_v1.png'), animations: 'disabled' });
      assets.push({ scene: scene.id, file: 'PVKH_MOTION_IDENT_KEYFRAME_v1.png', width: 1080, height: 1080, format: 'png', placeholder: false });
    }
  }
  for (const asset of assets) asset.sha256 = await sha256(path.join(stage, asset.file));
  await writeFile(path.join(stage, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, fps: DEFAULT_FPS, verticalDeliveryFps: 30, renderer: 'Playwright + ffmpeg', sourceSha256, placeholders: ['lower-third', 'story'], assets }, null, 2)}\n`);
  await browser.close();
  browser = null;
  await rm(output, { recursive: true, force: true });
  await rename(stage, output);
  console.log(`Motion render: PASS — ${assets.length} outputs from ${scenes.length} deterministic scenes`);
} finally {
  if (browser) await browser.close();
  await rm(framesRoot, { recursive: true, force: true });
  await rm(stage, { recursive: true, force: true });
}

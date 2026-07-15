#!/usr/bin/env node
import { chromium } from '../../tools/node_modules/playwright/index.mjs';
import AxeBuilder from '../../tools/node_modules/@axe-core/playwright/dist/index.mjs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'exports');
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
const sourceDigest = createHash('sha256');
for (const file of ['render.html', 'motion.css', 'motion-engine.js']) {
  sourceDigest.update(file);
  sourceDigest.update(await readFile(path.join(here, 'source', file)));
}
if (manifest.sourceSha256 !== sourceDigest.digest('hex')) throw new Error('Motion exports are stale relative to source');
if (JSON.stringify(manifest.placeholders) !== JSON.stringify(['lower-third', 'story'])) throw new Error('Motion placeholder scenes are not explicit');
const expectedScenes = new Set(['ident', 'transition', 'loop', 'blob-sound', 'blob-process', 'blob-archive', 'blob-team', 'blob-origin', 'blob-signal', 'blob-link', 'blob-prime', 'ambient-field', 'lower-third', 'story']);
const mp4Scenes = new Set(manifest.assets.filter(asset => asset.format === 'mp4').map(asset => asset.scene));
if (manifest.schemaVersion !== 1 || mp4Scenes.size !== 14 || [...expectedScenes].some(scene => !mp4Scenes.has(scene))) {
  throw new Error('Motion manifest does not contain all fourteen MP4 scenes');
}
if (manifest.fps !== 24 || manifest.verticalDeliveryFps !== 30) throw new Error('Motion FPS policy is missing or stale');
const storyMp4 = manifest.assets.find(asset => asset.scene === 'story' && asset.format === 'mp4');
if (!storyMp4 || storyMp4.fps < 30) throw new Error('Vertical Story/Reel preset must meet the 30 FPS delivery baseline');

for (const asset of manifest.assets) {
  const file = path.join(output, asset.file);
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  if (digest !== asset.sha256) throw new Error(`Hash mismatch: ${asset.file}`);
  if ((asset.scene === 'story' || asset.scene === 'lower-third') !== asset.placeholder) throw new Error(`Placeholder flag mismatch: ${asset.file}`);
  if (asset.format === 'png') {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', file]);
    const stream = JSON.parse(stdout).streams[0];
    if (stream.codec_name !== 'png' || stream.width !== asset.width || stream.height !== asset.height) throw new Error(`PNG keyframe mismatch: ${asset.file}`);
    continue;
  }
  const { stdout } = await exec('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate:format=duration', '-of', 'json', file,
  ]);
  const probe = JSON.parse(stdout);
  if (probe.streams.length !== 1 || probe.streams[0].codec_type !== 'video') throw new Error(`Expected one silent video stream: ${asset.file}`);
  const stream = probe.streams[0];
  if (stream.width !== asset.width || stream.height !== asset.height) throw new Error(`Dimension mismatch: ${asset.file}`);
  if (Math.abs(Number(probe.format.duration) - asset.durationSeconds) > 0.08) throw new Error(`Duration mismatch: ${asset.file}`);
  const [numerator, denominator] = stream.r_frame_rate.split('/').map(Number);
  if (Math.abs(numerator / denominator - asset.fps) > 0.05) throw new Error(`Frame-rate mismatch: ${asset.file}`);
  const expectedCodec = { mp4: 'h264', webm: 'vp9', gif: 'gif' }[asset.format];
  if (stream.codec_name !== expectedCodec) throw new Error(`Codec mismatch: ${asset.file}`);
}

const preview = await readFile(path.join(here, 'preview.html'), 'utf8');
const css = await readFile(path.join(here, 'source', 'motion.css'), 'utf8');
if (!preview.includes('prefers-reduced-motion:reduce') || !css.includes('prefers-reduced-motion: reduce')) {
  throw new Error('Reduced-motion support is missing');
}

const sceneSpecs = [
  { id: 'ident', width: 1080, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 72, bottom: 72 } },
  { id: 'loop', width: 1920, height: 1080, time: 2, safe: { left: 72, right: 72, top: 48, bottom: 48 } },
  { id: 'blob-sound', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'SOUND.', accent: '#F32222' },
  { id: 'blob-process', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'PROCESS.', accent: '#46A3FF' },
  { id: 'blob-archive', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'ARCHIVE.', accent: '#60E68C' },
  { id: 'blob-team', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'TEAM', accent: '#FF4FA3' },
  { id: 'blob-origin', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'ORIGIN', accent: '#B47CFF' },
  { id: 'blob-signal', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'SIGNAL', accent: '#FFB547' },
  { id: 'blob-link', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'LINK', accent: '#36D9E6' },
  { id: 'blob-prime', width: 1920, height: 1080, time: 1.2, safe: { left: 72, right: 72, top: 48, bottom: 48 }, word: 'PRIME', accent: '#D6FF3F' },
  { id: 'ambient-field', width: 1280, height: 720, time: 1.3, safe: { left: 0, right: 0, top: 0, bottom: 0 } },
  { id: 'lower-third', width: 1920, height: 1080, time: 1, safe: { left: 72, right: 72, top: 72, bottom: 72 } },
  { id: 'story', width: 1080, height: 1920, time: 1.5, safe: { left: 120, right: 240, top: 250, bottom: 320 } },
];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const spec of sceneSpecs) {
    await page.setViewportSize({ width: spec.width, height: spec.height });
    const url = `${pathToFileURL(path.join(here, 'source', 'render.html')).href}?scene=${spec.id}&time=${spec.time}`;
    const sceneUrl = new URL(url);
    if (spec.word) sceneUrl.searchParams.set('word', spec.word);
    if (spec.accent) sceneUrl.searchParams.set('accent', spec.accent);
    await page.goto(sceneUrl.href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__POVKH_READY__ === true);
    const boxes = await page.locator('[data-critical="true"]').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    }));
    for (const box of boxes) {
      if (box.left < spec.safe.left - 0.5 || box.right > spec.width - spec.safe.right + 0.5 || box.top < spec.safe.top - 0.5 || box.bottom > spec.height - spec.safe.bottom + 0.5) {
        throw new Error(`${spec.id} critical element outside safe zone: ${JSON.stringify(box)}`);
      }
    }
    if (spec.id === 'loop') {
      const overlap = await page.evaluate(() => {
        const signal = document.querySelector('.loop-signal').getBoundingClientRect();
        const mark = document.querySelector('.loop-mark').getBoundingClientRect();
        return signal.left < mark.right && signal.right > mark.left && signal.top < mark.bottom && signal.bottom > mark.top;
      });
      if (overlap) throw new Error('Loop signal line overlaps the protected publisher mark');
    }
  }
  for (const width of [375, 768, 1440]) {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(pathToFileURL(path.join(here, 'preview.html')).href, { waitUntil: 'load' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`Preview horizontal overflow at ${width}px: ${overflow}px`);
    const result = await new AxeBuilder({ page }).analyze();
    if (result.violations.length) throw new Error(`Preview axe violations at ${width}px: ${JSON.stringify(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })))}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(pathToFileURL(path.join(here, 'preview.html')).href, { waitUntil: 'load' });
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!reduced) throw new Error('Reduced-motion emulation was not observed by preview');
} finally {
  await browser.close();
}
console.log('Motion QA: PASS — source/hashes, ffprobe codec/fps/dimensions/durations, 14 scenes, 30 FPS vertical delivery, safe zones/no logo overlap, axe/responsive/reduced motion');

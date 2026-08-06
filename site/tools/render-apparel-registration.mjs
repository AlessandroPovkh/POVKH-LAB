import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registrationPath = path.join(siteRoot, "data", "apparel-print-registration-v02.json");
const output = Object.freeze({ width: 1536, height: 1024 });
const contactSheetOutput = Object.freeze({ width: 1800, height: 800 });
const contactSheetPath = "tools/fixtures/apparel-registration/apparel-registration-contact-sheet-v02.png";
const sourceCorners = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 1600, y: 0 }),
  Object.freeze({ x: 1600, y: 600 }),
  Object.freeze({ x: 0, y: 600 })
]);
const encoder = "ffmpeg/libwebp q=88 yuv420p metadata-stripped";

const point = ([x, y]) => ({ x, y });
const asset = (relativePath, sha256) => ({ path: relativePath, sha256 });

const garments = Object.freeze({
  "t-shirt": Object.freeze({
    master: Object.freeze({
      ...asset(
        "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_DARK_KNOCKOUT_EXACT_1600x600_v01.png",
        "c46bf6bd82ea2ec6928e9fe4ca9a314b56580af49c044be0395579c43c06dada"
      ),
      width: 1600,
      height: 600,
      pixelSha256: "a7a1caaa8c0d3cc5ff5b04b303d42f962ba0161f0516fd01a8e0a7af0f84b6c0",
      visibleBounds: Object.freeze({ left: 70, top: 60, right: 1510, bottom: 536, width: 1440, height: 476 }),
      visibleCentroid: Object.freeze({ x: 685.702012, y: 341.056496 })
    }),
    approvedHero: Object.freeze({
      path: "assets/merch/t-shirt-front.webp",
      sha256: "89cac41d6abf06cccc1952823b5c2dcdf4a063a063a98dfebb998b19c428db4e",
      pixelSha256: "2455ce7afdcc054e7b90eefda55dd3f4af6d3243c614b30826e4dabeec751cbf",
      assetDimensions: Object.freeze({ width: 1536, height: 1024 }),
      placementCoordinateSpace: "assetPixels",
      placement: Object.freeze({ x: 528, y: 350, width: 480, height: 180 })
    }),
    views: Object.freeze({
      "print-macro": Object.freeze({
        publicPath: "assets/merch/t-shirt-print-macro.webp",
        base: asset(
          "tools/fixtures/apparel-registration/bases/PVKH_BONE_SOURCE_TEE_PRINT_FIBER_MACRO_BLANK_BASE_v01.png",
          "cf6541fdeb286dd1c127cc3236e586a1907bb1a44ef398fa16bda178ff9bb042"
        ),
        sourceRenderPath: "tools/fixtures/apparel-registration/renders/t-shirt-print-macro-registration-v02.png",
        garmentMaskPath: "tools/fixtures/apparel-registration/masks/t-shirt-print-macro-garment-mask-v02.png",
        artworkMaskPath: "tools/fixtures/apparel-registration/masks/t-shirt-print-macro-applied-artwork-mask-v02.png",
        surfaceAnchors: [[150, 180], [1400, 190], [1390, 820], [160, 810]].map(point),
        artworkQuad: [[380, 340], [1156, 347], [1152, 638], [384, 631]].map(point),
        artworkBlendMode: "multiply",
        artworkOpacity: 0.92,
        textureReturnOpacity: 0,
        textureReturnClip: "artworkAlpha"
      }),
      "on-body": Object.freeze({
        publicPath: "assets/merch/t-shirt-on-body.webp",
        base: asset(
          "tools/fixtures/apparel-registration/bases/PVKH_BONE_SOURCE_TEE_ON_BODY_FRONT_BLANK_BASE_v01.png",
          "67e2c519ea7fee2d67303bef4088ebb98cca75d4d5325749c057551efd950b5e"
        ),
        sourceRenderPath: "tools/fixtures/apparel-registration/renders/t-shirt-on-body-registration-v02.png",
        garmentMaskPath: "tools/fixtures/apparel-registration/masks/t-shirt-on-body-garment-mask-v02.png",
        artworkMaskPath: "tools/fixtures/apparel-registration/masks/t-shirt-on-body-applied-artwork-mask-v02.png",
        surfaceAnchors: [[480, 235], [1055, 235], [1025, 700], [510, 700]].map(point),
        artworkQuad: [[598, 327], [938, 327], [930, 455], [604, 455]].map(point),
        artworkBlendMode: "multiply",
        artworkOpacity: 0.92,
        textureReturnOpacity: 0,
        textureReturnClip: "artworkAlpha"
      })
    })
  }),
  hoodie: Object.freeze({
    master: Object.freeze({
      ...asset(
        "tools/fixtures/apparel-registration/artwork/PVKH_ASCII_REVERSE_EXACT_1600x600_v01.png",
        "284e69cfb0e6e7fef2a993f44289577efabd1fae576c9280bab4d4e2f59b398f"
      ),
      width: 1600,
      height: 600,
      pixelSha256: "d09d549653f459c5b45e98646639698d4c2eb85ba6ef52451325be651ea12d36",
      visibleBounds: Object.freeze({ left: 70, top: 60, right: 1510, bottom: 536, width: 1440, height: 476 }),
      visibleCentroid: Object.freeze({ x: 685.702012, y: 341.056496 })
    }),
    approvedHero: Object.freeze({
      path: "assets/merch/hoodie-rear.webp",
      sha256: "d46462cbac738c17c4f4aaddb1ba1fc7c35f13ebe09cc70d967377927219aefa",
      pixelSha256: "687c77e118bcad6c5bc7b6dbfd1292c75c6e93f52face89fa1bdcbfb4a6b1a9b",
      assetDimensions: Object.freeze({ width: 1536, height: 1024 }),
      placementCoordinateSpace: "assetPixels",
      placement: Object.freeze({ x: 552, y: 365, width: 432, height: 162 })
    }),
    views: Object.freeze({
      "print-macro": Object.freeze({
        publicPath: "assets/merch/hoodie-print-macro.webp",
        base: asset(
          "tools/fixtures/apparel-registration/bases/PVKH_VOID_BACKMARK_HOODIE_PRINT_FIBER_MACRO_BLANK_BASE_v02.png",
          "d0e01e873ebd68673f25407efa08f8c6325ee088e2ad9ccae49f811f607bc905"
        ),
        baseRepair: Object.freeze({
          source: asset(
            "tools/fixtures/apparel-registration/bases/PVKH_VOID_BACKMARK_HOODIE_PRINT_FIBER_MACRO_BLANK_BASE_v01.png",
            "46fe2c064e42d8420eca02b7ef75a0eaa37ad4fe3768e67d2e111d651ad84b15"
          ),
          method: "preserve-low-frequency-field-and-transplant-clean-source-detail",
          blurSigma: 28,
          highFrequencyGain: 0.72,
          repairBounds: Object.freeze({ left: 735, top: 430, right: 1415, bottom: 870 }),
          fullStrengthBounds: Object.freeze({ left: 820, top: 515, right: 1365, bottom: 790 }),
          donorOffset: Object.freeze({ x: -520, y: 0 })
        }),
        sourceRenderPath: "tools/fixtures/apparel-registration/renders/hoodie-print-macro-registration-v02.png",
        garmentMaskPath: "tools/fixtures/apparel-registration/masks/hoodie-print-macro-garment-mask-v02.png",
        artworkMaskPath: "tools/fixtures/apparel-registration/masks/hoodie-print-macro-applied-artwork-mask-v02.png",
        surfaceAnchors: [[140, 170], [1400, 180], [1390, 820], [150, 810]].map(point),
        artworkQuad: [[357, 339], [1177, 347], [1173, 653], [357, 645]].map(point),
        artworkBlendMode: "normal",
        artworkOpacity: 0.88,
        textureReturnOpacity: 0.16,
        textureReturnClip: "artworkAlpha"
      }),
      "worn-rear": Object.freeze({
        publicPath: "assets/merch/hoodie-worn-rear.webp",
        base: asset(
          "tools/fixtures/apparel-registration/bases/PVKH_VOID_BACKMARK_HOODIE_WORN_REAR_THREE_QUARTER_BLANK_BASE_v01.png",
          "8556c8051f28f0f15bbf42d3ecce780d42b7802db9f556a2e85039f1cd3d666c"
        ),
        sourceRenderPath: "tools/fixtures/apparel-registration/renders/hoodie-worn-rear-registration-v02.png",
        garmentMaskPath: "tools/fixtures/apparel-registration/masks/hoodie-worn-rear-garment-mask-v02.png",
        artworkMaskPath: "tools/fixtures/apparel-registration/masks/hoodie-worn-rear-applied-artwork-mask-v02.png",
        surfaceAnchors: [[520, 300], [1005, 330], [980, 790], [550, 760]].map(point),
        artworkQuad: [[593, 353], [923, 370], [916, 492], [593, 478]].map(point),
        artworkBlendMode: "normal",
        artworkOpacity: 0.88,
        textureReturnOpacity: 0.16,
        textureReturnClip: "artworkAlpha"
      })
    })
  })
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha256 = async (file) => sha256(await readFile(file));

const dimensions = async (file) => {
  const { stdout } = await execFile("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
    "-of", "csv=s=x:p=0", file
  ]);
  const match = stdout.trim().match(/^(\d+)x(\d+)$/);
  if (!match) throw new Error(`cannot read dimensions for ${file}`);
  return { width: Number(match[1]), height: Number(match[2]) };
};

const assertAssetAtRoot = async (root, reference, expectedDimensions) => {
  const file = path.join(root, reference.path);
  const actualSha = await fileSha256(file);
  if (actualSha !== reference.sha256) throw new Error(`hash mismatch: ${reference.path}`);
  const actualDimensions = await dimensions(file);
  if (actualDimensions.width !== expectedDimensions.width || actualDimensions.height !== expectedDimensions.height) {
    throw new Error(`dimension mismatch: ${reference.path}`);
  }
};

const assertAsset = async (reference, expectedDimensions) => assertAssetAtRoot(siteRoot, reference, expectedDimensions);

const decodedRgba = async (file) => {
  const { stdout } = await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"
  ], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  return stdout;
};

const decodedRgbaSha256 = async (file) => sha256(await decodedRgba(file));

const pixelBounds = (pixels, dimensions, stride = 4, channel = 3, threshold = 8) => {
  let left = dimensions.width;
  let top = dimensions.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      if (pixels[(y * dimensions.width + x) * stride + channel] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (right <= left || bottom <= top) throw new Error("governed artwork pixels are empty");
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};

const round6 = (value) => Number(value.toFixed(6));

const pixelCentroid = (pixels, dimensions, stride = 4, channel = 3, threshold = 8) => {
  let weightedX = 0;
  let weightedY = 0;
  let weight = 0;
  for (let y = 0; y < dimensions.height; y += 1) {
    for (let x = 0; x < dimensions.width; x += 1) {
      const value = pixels[(y * dimensions.width + x) * stride + channel];
      if (value <= threshold) continue;
      weightedX += (x + 0.5) * value;
      weightedY += (y + 0.5) * value;
      weight += value;
    }
  }
  if (weight <= 0) throw new Error("governed artwork pixels have no measurable centroid");
  return { x: round6(weightedX / weight), y: round6(weightedY / weight) };
};

const heroRelativeRegistration = (garment, appliedArtworkBounds, appliedArtworkCentroid) => {
  const hero = garment.approvedHero;
  const master = garment.master;
  if (hero.placementCoordinateSpace !== "assetPixels" || Object.hasOwn(hero, "canvas")) {
    throw new Error("approved hero placement must use decoded asset-pixel coordinates");
  }
  const heroVisibleBounds = {
    width: master.visibleBounds.width / master.width * hero.placement.width,
    height: master.visibleBounds.height / master.height * hero.placement.height
  };
  const heroCenter = {
    x: (hero.placement.x + master.visibleCentroid.x / master.width * hero.placement.width) / hero.assetDimensions.width,
    y: (hero.placement.y + master.visibleCentroid.y / master.height * hero.placement.height) / hero.assetDimensions.height
  };
  const viewCenter = {
    x: appliedArtworkCentroid.x / output.width,
    y: appliedArtworkCentroid.y / output.height
  };
  return {
    centerOffset: {
      x: round6(viewCenter.x - heroCenter.x),
      y: round6(viewCenter.y - heroCenter.y)
    },
    scale: {
      x: round6((appliedArtworkBounds.width / output.width) / (heroVisibleBounds.width / hero.assetDimensions.width)),
      y: round6((appliedArtworkBounds.height / output.height) / (heroVisibleBounds.height / hero.assetDimensions.height))
    }
  };
};

const smoothStep = (start, end, value) => {
  const position = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return position * position * (3 - 2 * position);
};

const repairMacroBase = async (sourceFile, repair) => {
  const [source, lowFrequency] = await Promise.all([
    sharp(sourceFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(sourceFile).removeAlpha().blur(repair.blurSigma).raw().toBuffer({ resolveWithObject: true })
  ]);
  const { width, height, channels } = source.info;
  if (width !== output.width || height !== output.height || channels !== 3) {
    throw new Error("hoodie macro repair source dimensions drifted");
  }
  const repaired = Buffer.from(source.data);
  const changedPixelMask = Buffer.alloc(width * height);
  const index = (x, y, channel) => (y * width + x) * channels + channel;
  const { repairBounds, fullStrengthBounds, donorOffset } = repair;
  let changedPixels = 0;
  for (let y = repairBounds.top; y < repairBounds.bottom; y += 1) {
    for (let x = repairBounds.left; x < repairBounds.right; x += 1) {
      const feather = smoothStep(repairBounds.left, fullStrengthBounds.left, x)
        * (1 - smoothStep(fullStrengthBounds.right, repairBounds.right, x))
        * smoothStep(repairBounds.top, fullStrengthBounds.top, y)
        * (1 - smoothStep(fullStrengthBounds.bottom, repairBounds.bottom, y));
      if (feather <= 0) continue;
      const donorX = x + donorOffset.x;
      const donorY = y + donorOffset.y;
      let changed = false;
      for (let channel = 0; channel < channels; channel += 1) {
        const targetOffset = index(x, y, channel);
        const donorOffsetIndex = index(donorX, donorY, channel);
        const cleanDetail = (source.data[donorOffsetIndex] - lowFrequency.data[donorOffsetIndex])
          * repair.highFrequencyGain;
        const reconstructed = Math.max(0, Math.min(255, Math.round(
          lowFrequency.data[targetOffset] + cleanDetail
        )));
        const next = Math.round(source.data[targetOffset] * (1 - feather) + reconstructed * feather);
        if (next !== source.data[targetOffset]) changed = true;
        repaired[targetOffset] = next;
      }
      if (changed) {
        changedPixels += 1;
        changedPixelMask[y * width + x] = 1;
      }
    }
  }
  const bytes = await sharp(repaired, { raw: { width, height, channels } })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
  return { bytes, changedPixels, changedPixelMask };
};

const toolFingerprints = async (browser) => {
  const { stdout } = await execFile("ffmpeg", ["-version"]);
  const ffmpegVersion = stdout.trimEnd();
  return {
    playwright: require("playwright/package.json").version,
    chromium: browser.version(),
    ffmpeg: ffmpegVersion.split("\n")[0],
    ffmpegVersionSha256: sha256(Buffer.from(ffmpegVersion, "utf8"))
  };
};

const solveLinearSystem = (matrix, values) => {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("degenerate apparel artwork quad");
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let cell = column; cell <= size; cell += 1) augmented[column][cell] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let cell = column; cell <= size; cell += 1) augmented[row][cell] -= factor * augmented[column][cell];
    }
  }
  return augmented.map((row) => row[size]);
};

const homography = (source, target) => {
  const matrix = [];
  const values = [];
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index];
    const { x: u, y: v } = target[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }
  return [...solveLinearSystem(matrix, values), 1].map((value) => Math.abs(value) < 1e-14 ? 0 : value);
};

const inverse3 = ([a, b, c, d, e, f, g, h, i]) => {
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error("non-invertible apparel artwork homography");
  return [
    e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d
  ].map((value) => value / determinant);
};

const writeAtomic = async (file, bytes) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  await rm(temporary, { force: true });
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
};

const decodeDataUrl = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");

const renderPixels = async (page, { baseBytes, masterBytes, artworkToOutput, view }) => page.evaluate(async (input) => {
  const loadImageData = async (dataUrl, width, height) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error("governed raster dimensions drifted");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, width, height);
  };

  const encodePng = async (pixels, width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas.toDataURL("image/png");
  };

  const pointInPolygon = (x, y, polygon) => {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const a = polygon[index];
      const b = polygon[previous];
      if (((a.y > y) !== (b.y > y)) && (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)) inside = !inside;
    }
    return inside;
  };

  const project = (matrix, x, y) => {
    const divisor = matrix[6] * x + matrix[7] * y + matrix[8];
    return {
      x: (matrix[0] * x + matrix[1] * y + matrix[2]) / divisor,
      y: (matrix[3] * x + matrix[4] * y + matrix[5]) / divisor
    };
  };

  const sample = (pixels, width, height, x, y) => {
    const pixelX = Math.max(0, Math.min(width - 1, x - 0.5));
    const pixelY = Math.max(0, Math.min(height - 1, y - 0.5));
    const x0 = Math.floor(pixelX);
    const y0 = Math.floor(pixelY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const dx = pixelX - x0;
    const dy = pixelY - y0;
    const samples = [
      [x0, y0, (1 - dx) * (1 - dy)],
      [x1, y0, dx * (1 - dy)],
      [x0, y1, (1 - dx) * dy],
      [x1, y1, dx * dy]
    ];
    let alpha = 0;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (const [sampleX, sampleY, weight] of samples) {
      const offset = (sampleY * width + sampleX) * 4;
      const weightedAlpha = (pixels[offset + 3] / 255) * weight;
      alpha += weightedAlpha;
      red += pixels[offset] * weightedAlpha;
      green += pixels[offset + 1] * weightedAlpha;
      blue += pixels[offset + 2] * weightedAlpha;
    }
    return alpha > 0 ? { red: red / alpha, green: green / alpha, blue: blue / alpha, alpha } : null;
  };

  const base = await loadImageData(input.baseDataUrl, input.output.width, input.output.height);
  const master = await loadImageData(input.masterDataUrl, input.master.width, input.master.height);
  const render = new Uint8ClampedArray(base.data);
  const garmentMask = new Uint8ClampedArray(input.output.width * input.output.height * 4);
  const artworkMask = new Uint8ClampedArray(input.output.width * input.output.height * 4);
  const inverse = input.outputToArtwork;
  const bounds = {
    left: Math.floor(Math.min(...input.artworkQuad.map(({ x }) => x))),
    right: Math.ceil(Math.max(...input.artworkQuad.map(({ x }) => x))),
    top: Math.floor(Math.min(...input.artworkQuad.map(({ y }) => y))),
    bottom: Math.ceil(Math.max(...input.artworkQuad.map(({ y }) => y)))
  };

  for (let y = 0; y < input.output.height; y += 1) {
    for (let x = 0; x < input.output.width; x += 1) {
      const offset = (y * input.output.width + x) * 4;
      const insideGarment = pointInPolygon(x + 0.5, y + 0.5, input.surfaceAnchors);
      const maskValue = insideGarment ? 255 : 0;
      garmentMask[offset] = maskValue;
      garmentMask[offset + 1] = maskValue;
      garmentMask[offset + 2] = maskValue;
      garmentMask[offset + 3] = 255;
      artworkMask[offset + 3] = 255;
    }
  }

  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (x < 0 || y < 0 || x >= input.output.width || y >= input.output.height) continue;
      if (!pointInPolygon(x + 0.5, y + 0.5, input.artworkQuad)) continue;
      if (!pointInPolygon(x + 0.5, y + 0.5, input.surfaceAnchors)) continue;
      const source = project(inverse, x + 0.5, y + 0.5);
      if (source.x < 0 || source.y < 0 || source.x >= input.master.width || source.y >= input.master.height) continue;
      const artwork = sample(master.data, input.master.width, input.master.height, source.x, source.y);
      if (!artwork || artwork.alpha <= 0) continue;
      const offset = (y * input.output.width + x) * 4;
      const appliedAlpha = artwork.alpha * input.artworkOpacity;
      const maskValue = Math.round(appliedAlpha * 255);
      artworkMask[offset] = maskValue;
      artworkMask[offset + 1] = maskValue;
      artworkMask[offset + 2] = maskValue;

      for (let channel = 0; channel < 3; channel += 1) {
        const baseValue = base.data[offset + channel];
        const artworkValue = channel === 0 ? artwork.red : channel === 1 ? artwork.green : artwork.blue;
        const blended = input.artworkBlendMode === "multiply"
          ? baseValue * artworkValue / 255
          : artworkValue;
        render[offset + channel] = Math.round(baseValue * (1 - appliedAlpha) + blended * appliedAlpha);
      }
      render[offset + 3] = 255;
    }
  }

  if (input.textureReturnOpacity > 0) {
    for (let y = bounds.top; y < bounds.bottom; y += 1) {
      for (let x = bounds.left; x < bounds.right; x += 1) {
        if (x < 0 || y < 0 || x >= input.output.width || y >= input.output.height) continue;
        if (!pointInPolygon(x + 0.5, y + 0.5, input.artworkQuad)) continue;
        if (!pointInPolygon(x + 0.5, y + 0.5, input.surfaceAnchors)) continue;
        const offset = (y * input.output.width + x) * 4;
        const textureReturnAlpha = input.textureReturnClip === "artworkAlpha"
          ? input.textureReturnOpacity * artworkMask[offset] / 255
          : input.textureReturnOpacity;
        if (textureReturnAlpha <= 0) continue;
        for (let channel = 0; channel < 3; channel += 1) {
          const composed = render[offset + channel];
          const textureBlend = composed * base.data[offset + channel] / 255;
          render[offset + channel] = Math.round(
            composed * (1 - textureReturnAlpha) + textureBlend * textureReturnAlpha
          );
        }
      }
    }
  }

  const appliedArtworkBounds = {
    left: input.output.width,
    top: input.output.height,
    right: -1,
    bottom: -1
  };
  let weightedX = 0;
  let weightedY = 0;
  let artworkWeight = 0;
  let comparedPixels = 0;
  let changedPixels = 0;
  for (let y = 0; y < input.output.height; y += 1) {
    for (let x = 0; x < input.output.width; x += 1) {
      const offset = (y * input.output.width + x) * 4;
      const maskValue = artworkMask[offset];
      if (maskValue === 0) {
        comparedPixels += 1;
        if (render[offset] !== base.data[offset]
          || render[offset + 1] !== base.data[offset + 1]
          || render[offset + 2] !== base.data[offset + 2]) changedPixels += 1;
      }
      if (maskValue <= 8) continue;
      appliedArtworkBounds.left = Math.min(appliedArtworkBounds.left, x);
      appliedArtworkBounds.top = Math.min(appliedArtworkBounds.top, y);
      appliedArtworkBounds.right = Math.max(appliedArtworkBounds.right, x + 1);
      appliedArtworkBounds.bottom = Math.max(appliedArtworkBounds.bottom, y + 1);
      weightedX += (x + 0.5) * maskValue;
      weightedY += (y + 0.5) * maskValue;
      artworkWeight += maskValue;
    }
  }
  if (appliedArtworkBounds.right <= appliedArtworkBounds.left || appliedArtworkBounds.bottom <= appliedArtworkBounds.top) {
    throw new Error("rendered artwork pixels are empty");
  }
  appliedArtworkBounds.width = appliedArtworkBounds.right - appliedArtworkBounds.left;
  appliedArtworkBounds.height = appliedArtworkBounds.bottom - appliedArtworkBounds.top;
  const appliedArtworkCentroid = {
    x: Number((weightedX / artworkWeight).toFixed(6)),
    y: Number((weightedY / artworkWeight).toFixed(6))
  };

  return {
    render: await encodePng(render, input.output.width, input.output.height),
    garmentMask: await encodePng(garmentMask, input.output.width, input.output.height),
    artworkMask: await encodePng(artworkMask, input.output.width, input.output.height),
    appliedArtworkBounds,
    appliedArtworkCentroid,
    outsideAppliedArtworkMask: {
      rule: "source-render-rgb-equals-base-where-applied-artwork-mask-is-zero",
      comparedPixels,
      changedPixels
    }
  };
}, {
  baseDataUrl: `data:image/png;base64,${baseBytes.toString("base64")}`,
  masterDataUrl: `data:image/png;base64,${masterBytes.toString("base64")}`,
  master: { width: 1600, height: 600 },
  output,
  outputToArtwork: inverse3(artworkToOutput),
  artworkQuad: view.artworkQuad,
  surfaceAnchors: view.surfaceAnchors,
  artworkBlendMode: view.artworkBlendMode,
  artworkOpacity: view.artworkOpacity,
  textureReturnOpacity: view.textureReturnOpacity,
  textureReturnClip: view.textureReturnClip
});

const encodeWebp = async (sourceFile, outputFile) => {
  await mkdir(path.dirname(outputFile), { recursive: true });
  const temporary = `${outputFile}.tmp-${process.pid}.webp`;
  await rm(temporary, { force: true });
  try {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", sourceFile,
      "-vf", "format=yuv420p", "-map_metadata", "-1", "-frames:v", "1",
      "-c:v", "libwebp", "-quality", "88", "-compression_level", "6", temporary
    ]);
    await rename(temporary, outputFile);
  } finally {
    await rm(temporary, { force: true });
  }
};

const renderContactSheet = async (stageRoot, outputFile) => {
  const panelPaths = [
    path.join(siteRoot, garments["t-shirt"].approvedHero.path),
    path.join(stageRoot, garments["t-shirt"].views["print-macro"].publicPath),
    path.join(stageRoot, garments["t-shirt"].views["on-body"].publicPath),
    path.join(siteRoot, garments.hoodie.approvedHero.path),
    path.join(stageRoot, garments.hoodie.views["print-macro"].publicPath),
    path.join(stageRoot, garments.hoodie.views["worn-rear"].publicPath)
  ];
  const panels = await Promise.all(panelPaths.map((file) => sharp(file)
    .resize(600, 400, { fit: "contain", background: "#111315" })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer()));
  await mkdir(path.dirname(outputFile), { recursive: true });
  await sharp({
    create: {
      width: contactSheetOutput.width,
      height: contactSheetOutput.height,
      channels: 4,
      background: "#111315"
    }
  }).composite(panels.map((input, index) => ({
    input,
    left: (index % 3) * 600,
    top: Math.floor(index / 3) * 400
  }))).png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(outputFile);
};

const validateGovernedInputs = async () => {
  for (const garment of Object.values(garments)) {
    await assertAsset(garment.master, { width: 1600, height: 600 });
    const masterPixels = await decodedRgba(path.join(siteRoot, garment.master.path));
    if (sha256(masterPixels) !== garment.master.pixelSha256) throw new Error(`master pixel hash mismatch: ${garment.master.path}`);
    const visibleBounds = pixelBounds(masterPixels, { width: 1600, height: 600 });
    if (JSON.stringify(visibleBounds) !== JSON.stringify(garment.master.visibleBounds)) {
      throw new Error(`master visible bounds mismatch: ${garment.master.path}`);
    }
    const visibleCentroid = pixelCentroid(masterPixels, { width: 1600, height: 600 });
    if (JSON.stringify(visibleCentroid) !== JSON.stringify(garment.master.visibleCentroid)) {
      throw new Error(`master visible centroid mismatch: ${garment.master.path}`);
    }
    await assertAsset(garment.approvedHero, garment.approvedHero.assetDimensions);
    if (garment.approvedHero.placementCoordinateSpace !== "assetPixels" || Object.hasOwn(garment.approvedHero, "canvas")) {
      throw new Error(`approved hero coordinate authority drift: ${garment.approvedHero.path}`);
    }
    const heroPixelSha = await decodedRgbaSha256(path.join(siteRoot, garment.approvedHero.path));
    if (heroPixelSha !== garment.approvedHero.pixelSha256) throw new Error(`approved hero pixel hash mismatch: ${garment.approvedHero.path}`);
    for (const view of Object.values(garment.views)) {
      await assertAsset(view.baseRepair?.source ?? view.base, output);
    }
  }
};

const buildStagedBundle = async (stageRoot) => {
  await validateGovernedInputs();

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const records = {};
  const artifacts = [];
  const addArtifact = (projectPath) => {
    const record = {
      projectPath,
      stageFile: path.join(stageRoot, projectPath),
      finalFile: path.join(siteRoot, projectPath)
    };
    artifacts.push(record);
    return record.stageFile;
  };
  let fingerprints;
  try {
    fingerprints = await toolFingerprints(browser);
    const page = await browser.newPage({ viewport: output });
    for (const [slug, garment] of Object.entries(garments)) {
      const masterBytes = await readFile(path.join(siteRoot, garment.master.path));
      records[slug] = { master: garment.master, approvedHero: garment.approvedHero, views: {} };
      for (const [role, view] of Object.entries(garment.views)) {
        let baseBytes;
        let baseRepair;
        let baseRepairChangedPixelMask;
        if (view.baseRepair) {
          const repaired = await repairMacroBase(path.join(siteRoot, view.baseRepair.source.path), view.baseRepair);
          if (sha256(repaired.bytes) !== view.base.sha256) throw new Error(`repaired base hash mismatch: ${slug}/${role}`);
          const baseFile = addArtifact(view.base.path);
          await writeAtomic(baseFile, repaired.bytes);
          baseBytes = repaired.bytes;
          baseRepairChangedPixelMask = repaired.changedPixelMask;
          baseRepair = { ...view.baseRepair, changedPixels: repaired.changedPixels };
        } else {
          baseBytes = await readFile(path.join(siteRoot, view.base.path));
        }
        const artworkToOutput = homography(sourceCorners, view.artworkQuad);
        const rendered = await renderPixels(page, {
          baseBytes,
          masterBytes,
          artworkToOutput,
          view
        });
        const renderBytes = decodeDataUrl(rendered.render);
        const garmentMaskBytes = decodeDataUrl(rendered.garmentMask);
        const artworkMaskBytes = decodeDataUrl(rendered.artworkMask);
        if (baseRepair) {
          const artworkMaskPixels = await sharp(artworkMaskBytes).greyscale().raw().toBuffer();
          let changedOutsideFinalArtworkMaskPixels = 0;
          for (let pixel = 0; pixel < baseRepairChangedPixelMask.length; pixel += 1) {
            if (baseRepairChangedPixelMask[pixel] !== 0 && artworkMaskPixels[pixel] === 0) {
              changedOutsideFinalArtworkMaskPixels += 1;
            }
          }
          baseRepair = {
            ...baseRepair,
            changedOutsideFinalArtworkMaskPixels,
            outsideRepairBoundsChangedPixels: 0
          };
        }
        const sourceRenderFile = addArtifact(view.sourceRenderPath);
        const garmentMaskFile = addArtifact(view.garmentMaskPath);
        const artworkMaskFile = addArtifact(view.artworkMaskPath);
        const publicFile = addArtifact(view.publicPath);
        await writeAtomic(sourceRenderFile, renderBytes);
        await writeAtomic(garmentMaskFile, garmentMaskBytes);
        await writeAtomic(artworkMaskFile, artworkMaskBytes);
        await encodeWebp(sourceRenderFile, publicFile);

        records[slug].views[role] = {
          publicPath: view.publicPath,
          output,
          base: view.base,
          ...(baseRepair ? { baseRepair } : {}),
          sourceRender: {
            ...asset(view.sourceRenderPath, sha256(renderBytes)),
            pixelSha256: await decodedRgbaSha256(sourceRenderFile)
          },
          garmentMask: {
            ...asset(view.garmentMaskPath, sha256(garmentMaskBytes)),
            pixelSha256: await decodedRgbaSha256(garmentMaskFile)
          },
          appliedArtworkMask: {
            ...asset(view.artworkMaskPath, sha256(artworkMaskBytes)),
            pixelSha256: await decodedRgbaSha256(artworkMaskFile)
          },
          fabricModulation: {
            enabled: true,
            ...view.base,
            artworkBlendMode: view.artworkBlendMode,
            artworkOpacity: view.artworkOpacity,
            textureReturnOpacity: view.textureReturnOpacity,
            textureReturnClip: view.textureReturnClip
          },
          sourceCorners,
          surfaceAnchors: view.surfaceAnchors,
          artworkQuad: view.artworkQuad,
          artworkToOutput,
          appliedArtworkBounds: rendered.appliedArtworkBounds,
          appliedArtworkCentroid: rendered.appliedArtworkCentroid,
          heroRelative: heroRelativeRegistration(
            garment,
            rendered.appliedArtworkBounds,
            rendered.appliedArtworkCentroid
          ),
          outsideAppliedArtworkMask: rendered.outsideAppliedArtworkMask,
          outputSha256: await fileSha256(publicFile),
          outputPixelSha256: await decodedRgbaSha256(publicFile),
          encoder
        };
      }
    }
  } finally {
    await browser.close();
  }

  const contactSheetFile = addArtifact(contactSheetPath);
  await renderContactSheet(stageRoot, contactSheetFile);
  const contactSheetBytes = await readFile(contactSheetFile);

  const registration = {
    schemaVersion: 2,
    canonicalPlane: {
      width: 1600,
      height: 600,
      physicalSizeMm: { width: 300, height: 112.5 },
      tolerances: { scale: 0.02, center: 0.02 }
    },
    renderer: {
      path: "tools/render-apparel-registration.mjs",
      method: "inverse-homography bilinear RGBA composition",
      publicEncoder: encoder,
      pixelDeterministic: true,
      encodedBytesDeterministic: false,
      fingerprints
    },
    garments: records,
    visualQa: {
      reviewMethod: "hero / print macro / worn-or-on-body contact sheet",
      layout: "t-shirt hero / print macro / on-body; hoodie hero / print macro / worn-rear",
      contactSheet: {
        ...asset(contactSheetPath, sha256(contactSheetBytes)),
        pixelSha256: await decodedRgbaSha256(contactSheetFile),
        ...contactSheetOutput
      }
    }
  };
  const stagedRegistrationFile = addArtifact(path.relative(siteRoot, registrationPath));
  await writeAtomic(stagedRegistrationFile, Buffer.from(`${JSON.stringify(registration, null, 2)}\n`, "utf8"));
  return { artifacts, registration, stageRoot };
};

const assertRegistrationContract = (registration) => {
  if (registration.schemaVersion !== 2) throw new Error("apparel registration schema must remain v2");
  if (registration.renderer?.pixelDeterministic !== true) throw new Error("renderer must declare pixel determinism");
  if (registration.renderer?.encodedBytesDeterministic !== false) {
    throw new Error("renderer must not claim cross-platform encoded byte determinism");
  }
  const fingerprints = registration.renderer?.fingerprints;
  if (!fingerprints?.playwright || !fingerprints.chromium || !fingerprints.ffmpeg || !fingerprints.ffmpegVersionSha256) {
    throw new Error("renderer fingerprints are incomplete");
  }
  const repairViews = [];
  for (const [slug, garment] of Object.entries(garments)) {
    const record = registration.garments?.[slug];
    if (!record) throw new Error(`missing garment registration: ${slug}`);
    if (JSON.stringify(record.master) !== JSON.stringify(garment.master)) throw new Error(`master registration drift: ${slug}`);
    if (JSON.stringify(record.approvedHero) !== JSON.stringify(garment.approvedHero)) throw new Error(`approved hero registration drift: ${slug}`);
    for (const [role, view] of Object.entries(garment.views)) {
      const registered = record.views?.[role];
      if (!registered) throw new Error(`missing view registration: ${slug}/${role}`);
      const expectedHomography = homography(sourceCorners, view.artworkQuad);
      if (registered.artworkToOutput?.length !== 9 || registered.artworkToOutput.some((value, index) => (
        Math.abs(value - expectedHomography[index]) > 1e-10
      ))) throw new Error(`homography drift: ${slug}/${role}`);
      if (JSON.stringify(registered.surfaceAnchors) !== JSON.stringify(view.surfaceAnchors)) {
        throw new Error(`surface anchor drift: ${slug}/${role}`);
      }
      if (JSON.stringify(registered.artworkQuad) !== JSON.stringify(view.artworkQuad)) {
        throw new Error(`artwork quad drift: ${slug}/${role}`);
      }
      if (JSON.stringify(registered.heroRelative) !== JSON.stringify(heroRelativeRegistration(
        garment,
        registered.appliedArtworkBounds,
        registered.appliedArtworkCentroid
      ))) {
        throw new Error(`hero-relative registration drift: ${slug}/${role}`);
      }
      const visibleBounds = registered.appliedArtworkBounds;
      if (!visibleBounds || visibleBounds.width <= 0 || visibleBounds.height <= 0) {
        throw new Error(`applied artwork bounds are missing: ${slug}/${role}`);
      }
      const visibleCentroid = registered.appliedArtworkCentroid;
      if (!visibleCentroid || !Number.isFinite(visibleCentroid.x) || !Number.isFinite(visibleCentroid.y)) {
        throw new Error(`applied artwork centroid is missing: ${slug}/${role}`);
      }
      if (registered.outsideAppliedArtworkMask?.changedPixels !== 0) {
        throw new Error(`source render changed outside applied artwork mask: ${slug}/${role}`);
      }
      if (Boolean(registered.baseRepair) !== Boolean(view.baseRepair)) {
        throw new Error(`unauthorized base repair registration: ${slug}/${role}`);
      }
      if (registered.baseRepair) repairViews.push(`${slug}/${role}`);
      if (view.baseRepair && JSON.stringify(registered.baseRepair) !== JSON.stringify({
        ...view.baseRepair,
        changedPixels: registered.baseRepair?.changedPixels,
        changedOutsideFinalArtworkMaskPixels: registered.baseRepair?.changedOutsideFinalArtworkMaskPixels,
        outsideRepairBoundsChangedPixels: 0
      })) throw new Error(`base repair registration drift: ${slug}/${role}`);
    }
  }
  if (JSON.stringify(repairViews) !== JSON.stringify(["hoodie/print-macro"])) {
    throw new Error("only hoodie/print-macro may declare a blank-base repair");
  }
  if (registration.visualQa?.reviewMethod !== "hero / print macro / worn-or-on-body contact sheet") {
    throw new Error("apparel visual QA review method drifted");
  }
  if (registration.visualQa?.contactSheet?.path !== contactSheetPath) throw new Error("apparel contact sheet path drifted");
};

const validateStagedBundle = async ({ artifacts, registration, stageRoot }) => {
  assertRegistrationContract(registration);
  if (artifacts.length !== 19) throw new Error(`apparel registration bundle must stage 19 files; received ${artifacts.length}`);
  const projectPaths = new Set();
  for (const artifact of artifacts) {
    if (projectPaths.has(artifact.projectPath)) throw new Error(`duplicate staged artifact: ${artifact.projectPath}`);
    projectPaths.add(artifact.projectPath);
    await stat(artifact.stageFile);
  }
  const stagedRegistration = JSON.parse(await readFile(path.join(stageRoot, path.relative(siteRoot, registrationPath)), "utf8"));
  if (JSON.stringify(stagedRegistration) !== JSON.stringify(registration)) throw new Error("staged registration JSON drifted");
  await assertAssetAtRoot(stageRoot, registration.visualQa.contactSheet, contactSheetOutput);
  const contactSheetPixelSha = await decodedRgbaSha256(path.join(stageRoot, registration.visualQa.contactSheet.path));
  if (contactSheetPixelSha !== registration.visualQa.contactSheet.pixelSha256) {
    throw new Error("staged contact sheet pixel hash mismatch");
  }

  for (const [slug, garment] of Object.entries(registration.garments)) {
    for (const [role, view] of Object.entries(garment.views)) {
      if (view.baseRepair) await assertAssetAtRoot(stageRoot, view.base, output);
      await assertAssetAtRoot(stageRoot, view.sourceRender, output);
      await assertAssetAtRoot(stageRoot, view.garmentMask, output);
      await assertAssetAtRoot(stageRoot, view.appliedArtworkMask, output);
      await assertAssetAtRoot(stageRoot, { path: view.publicPath, sha256: view.outputSha256 }, output);
      const checks = [
        [view.sourceRender.path, view.sourceRender.pixelSha256, "source render"],
        [view.garmentMask.path, view.garmentMask.pixelSha256, "garment mask"],
        [view.appliedArtworkMask.path, view.appliedArtworkMask.pixelSha256, "artwork mask"],
        [view.publicPath, view.outputPixelSha256, "public WebP"]
      ];
      for (const [projectPath, expectedPixelSha, label] of checks) {
        const actualPixelSha = await decodedRgbaSha256(path.join(stageRoot, projectPath));
        if (actualPixelSha !== expectedPixelSha) throw new Error(`staged ${label} pixel hash mismatch: ${slug}/${role}`);
      }
      const artworkMaskPixels = await decodedRgba(path.join(stageRoot, view.appliedArtworkMask.path));
      const actualBounds = pixelBounds(artworkMaskPixels, output, 4, 0);
      if (JSON.stringify(actualBounds) !== JSON.stringify(view.appliedArtworkBounds)) {
        throw new Error(`staged artwork bounds mismatch: ${slug}/${role}`);
      }
      const actualCentroid = pixelCentroid(artworkMaskPixels, output, 4, 0);
      if (JSON.stringify(actualCentroid) !== JSON.stringify(view.appliedArtworkCentroid)) {
        throw new Error(`staged artwork centroid mismatch: ${slug}/${role}`);
      }
    }
  }
};

const fileExists = async (file) => {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};

export const publishStagedBundle = async (artifacts, {
  backupParent = siteRoot,
  renameFile = rename
} = {}) => {
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error("cannot publish an empty apparel bundle");
  const backupRoot = await mkdtemp(path.join(backupParent, ".apparel-registration-backup-"));
  const backups = [];
  try {
    for (const [index, artifact] of artifacts.entries()) {
      await stat(artifact.stageFile);
      await mkdir(path.dirname(artifact.finalFile), { recursive: true });
      const existed = await fileExists(artifact.finalFile);
      const backupFile = path.join(backupRoot, `${String(index).padStart(2, "0")}-${path.basename(artifact.finalFile)}`);
      if (existed) await copyFile(artifact.finalFile, backupFile);
      backups.push({ ...artifact, backupFile, existed });
    }

    try {
      for (const artifact of artifacts) await renameFile(artifact.stageFile, artifact.finalFile);
    } catch (publishError) {
      const rollbackErrors = [];
      for (const backup of [...backups].reverse()) {
        try {
          if (backup.existed) await copyFile(backup.backupFile, backup.finalFile);
          else await rm(backup.finalFile, { force: true });
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([publishError, ...rollbackErrors], "apparel bundle publish and rollback failed");
      }
      throw publishError;
    }
  } finally {
    await rm(backupRoot, { recursive: true, force: true });
  }
};

export const renderApparelRegistration = async () => {
  const stageRoot = await mkdtemp(path.join(siteRoot, ".apparel-registration-stage-"));
  try {
    const stagedBundle = await buildStagedBundle(stageRoot);
    await validateStagedBundle(stagedBundle);
    await publishStagedBundle(stagedBundle.artifacts);
    return 4;
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
};

const comparePixelArtifact = async ({
  committedFile,
  committedPixelSha,
  stagedFile,
  stagedPixelSha,
  label,
  identity
}) => {
  const committedActual = await decodedRgbaSha256(committedFile);
  if (committedActual !== committedPixelSha) throw new Error(`${label} pixel hash mismatch: ${identity}`);
  const stagedActual = await decodedRgbaSha256(stagedFile);
  if (stagedActual !== stagedPixelSha) throw new Error(`staged ${label} pixel hash mismatch: ${identity}`);
  if (stagedActual !== committedActual) throw new Error(`dry rerender ${label} pixel mismatch: ${identity}`);
};

export const verifyApparelRegistration = async ({ registrationFile = registrationPath } = {}) => {
  await validateGovernedInputs();
  const committedRegistration = JSON.parse(await readFile(registrationFile, "utf8"));
  const stageRoot = await mkdtemp(path.join(siteRoot, ".apparel-registration-verify-"));
  try {
    const stagedBundle = await buildStagedBundle(stageRoot);
    await validateStagedBundle(stagedBundle);
    assertRegistrationContract(committedRegistration);
    const committedContactSheet = committedRegistration.visualQa.contactSheet;
    const stagedContactSheet = stagedBundle.registration.visualQa.contactSheet;
    await assertAsset(committedContactSheet, contactSheetOutput);
    await comparePixelArtifact({
      committedFile: path.join(siteRoot, committedContactSheet.path),
      committedPixelSha: committedContactSheet.pixelSha256,
      stagedFile: path.join(stageRoot, stagedContactSheet.path),
      stagedPixelSha: stagedContactSheet.pixelSha256,
      label: "contact sheet",
      identity: "apparel"
    });
    let count = 0;
    for (const [slug, garment] of Object.entries(garments)) {
      const committedGarment = committedRegistration.garments[slug];
      const stagedGarment = stagedBundle.registration.garments[slug];
      for (const [role, view] of Object.entries(garment.views)) {
        const committed = committedGarment.views[role];
        const staged = stagedGarment.views[role];
        await assertAsset(committed.sourceRender, output);
        await assertAsset(committed.garmentMask, output);
        await assertAsset(committed.appliedArtworkMask, output);
        await assertAsset({ path: committed.publicPath, sha256: committed.outputSha256 }, output);
        if (view.baseRepair) {
          await assertAsset(committed.base, output);
          await assertAssetAtRoot(stageRoot, staged.base, output);
          if (committed.base.sha256 !== staged.base.sha256) throw new Error(`dry rerender repaired base mismatch: ${slug}/${role}`);
        }
        await comparePixelArtifact({
          committedFile: path.join(siteRoot, committed.sourceRender.path),
          committedPixelSha: committed.sourceRender.pixelSha256,
          stagedFile: path.join(stageRoot, staged.sourceRender.path),
          stagedPixelSha: staged.sourceRender.pixelSha256,
          label: "source render",
          identity: `${slug}/${role}`
        });
        await comparePixelArtifact({
          committedFile: path.join(siteRoot, committed.garmentMask.path),
          committedPixelSha: committed.garmentMask.pixelSha256,
          stagedFile: path.join(stageRoot, staged.garmentMask.path),
          stagedPixelSha: staged.garmentMask.pixelSha256,
          label: "garment mask",
          identity: `${slug}/${role}`
        });
        await comparePixelArtifact({
          committedFile: path.join(siteRoot, committed.appliedArtworkMask.path),
          committedPixelSha: committed.appliedArtworkMask.pixelSha256,
          stagedFile: path.join(stageRoot, staged.appliedArtworkMask.path),
          stagedPixelSha: staged.appliedArtworkMask.pixelSha256,
          label: "artwork mask",
          identity: `${slug}/${role}`
        });
        await comparePixelArtifact({
          committedFile: path.join(siteRoot, committed.publicPath),
          committedPixelSha: committed.outputPixelSha256,
          stagedFile: path.join(stageRoot, staged.publicPath),
          stagedPixelSha: staged.outputPixelSha256,
          label: "public WebP",
          identity: `${slug}/${role}`
        });
        if (JSON.stringify(committed.artworkToOutput) !== JSON.stringify(staged.artworkToOutput)) {
          throw new Error(`dry rerender homography mismatch: ${slug}/${role}`);
        }
        if (JSON.stringify(committed.appliedArtworkBounds) !== JSON.stringify(staged.appliedArtworkBounds)) {
          throw new Error(`dry rerender artwork bounds mismatch: ${slug}/${role}`);
        }
        if (JSON.stringify(committed.appliedArtworkCentroid) !== JSON.stringify(staged.appliedArtworkCentroid)) {
          throw new Error(`dry rerender artwork centroid mismatch: ${slug}/${role}`);
        }
        if (JSON.stringify(committed.outsideAppliedArtworkMask) !== JSON.stringify(staged.outsideAppliedArtworkMask)) {
          throw new Error(`dry rerender outside-print preservation mismatch: ${slug}/${role}`);
        }
        if (JSON.stringify(committed.baseRepair) !== JSON.stringify(staged.baseRepair)) {
          throw new Error(`dry rerender base repair mismatch: ${slug}/${role}`);
        }
        if (JSON.stringify(committed.heroRelative) !== JSON.stringify(staged.heroRelative)) {
          throw new Error(`dry rerender hero-relative registration mismatch: ${slug}/${role}`);
        }
        count += 1;
      }
    }
    return count;
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const count = await renderApparelRegistration();
    process.stdout.write(`rendered and bundle-published ${count} apparel registrations\n`);
  } else if (args.length === 1 && args[0] === "--verify") {
    const count = await verifyApparelRegistration();
    process.stdout.write(`dry-rerendered and pixel-verified ${count} apparel registrations\n`);
  } else {
    throw new Error(`unsupported apparel registration arguments: ${args.join(" ")}`);
  }
}

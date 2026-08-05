import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registrationPath = path.join(siteRoot, "data", "apparel-print-registration-v02.json");
const output = Object.freeze({ width: 1536, height: 1024 });
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
      height: 600
    }),
    approvedHero: Object.freeze({
      path: "assets/merch/t-shirt-front.webp",
      canvas: Object.freeze({ width: 1600, height: 900 }),
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
        artworkQuad: [[250, 290], [1286, 300], [1280, 688], [256, 678]].map(point),
        artworkBlendMode: "multiply",
        artworkOpacity: 0.92,
        textureReturnOpacity: 0
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
        artworkQuad: [[606, 330], [930, 330], [922, 452], [612, 452]].map(point),
        artworkBlendMode: "multiply",
        artworkOpacity: 0.92,
        textureReturnOpacity: 0
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
      height: 600
    }),
    approvedHero: Object.freeze({
      path: "assets/merch/hoodie-rear.webp",
      canvas: Object.freeze({ width: 1600, height: 900 }),
      placement: Object.freeze({ x: 552, y: 365, width: 432, height: 162 })
    }),
    views: Object.freeze({
      "print-macro": Object.freeze({
        publicPath: "assets/merch/hoodie-print-macro.webp",
        base: asset(
          "tools/fixtures/apparel-registration/bases/PVKH_VOID_BACKMARK_HOODIE_PRINT_FIBER_MACRO_BLANK_BASE_v01.png",
          "46fe2c064e42d8420eca02b7ef75a0eaa37ad4fe3768e67d2e111d651ad84b15"
        ),
        sourceRenderPath: "tools/fixtures/apparel-registration/renders/hoodie-print-macro-registration-v02.png",
        garmentMaskPath: "tools/fixtures/apparel-registration/masks/hoodie-print-macro-garment-mask-v02.png",
        artworkMaskPath: "tools/fixtures/apparel-registration/masks/hoodie-print-macro-applied-artwork-mask-v02.png",
        surfaceAnchors: [[140, 170], [1400, 180], [1390, 820], [150, 810]].map(point),
        artworkQuad: [[254, 300], [1280, 310], [1274, 692], [254, 682]].map(point),
        artworkBlendMode: "normal",
        artworkOpacity: 0.88,
        textureReturnOpacity: 0.16
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
        artworkQuad: [[621, 356], [895, 370], [889, 472], [621, 460]].map(point),
        artworkBlendMode: "normal",
        artworkOpacity: 0.88,
        textureReturnOpacity: 0.16
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

const assertAsset = async (reference, expectedDimensions) => {
  const file = path.join(siteRoot, reference.path);
  const actualSha = await fileSha256(file);
  if (actualSha !== reference.sha256) throw new Error(`hash mismatch: ${reference.path}`);
  const actualDimensions = await dimensions(file);
  if (actualDimensions.width !== expectedDimensions.width || actualDimensions.height !== expectedDimensions.height) {
    throw new Error(`dimension mismatch: ${reference.path}`);
  }
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
        for (let channel = 0; channel < 3; channel += 1) {
          const composed = render[offset + channel];
          const textureBlend = composed * base.data[offset + channel] / 255;
          render[offset + channel] = Math.round(
            composed * (1 - input.textureReturnOpacity) + textureBlend * input.textureReturnOpacity
          );
        }
      }
    }
  }

  return {
    render: await encodePng(render, input.output.width, input.output.height),
    garmentMask: await encodePng(garmentMask, input.output.width, input.output.height),
    artworkMask: await encodePng(artworkMask, input.output.width, input.output.height)
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
  textureReturnOpacity: view.textureReturnOpacity
});

const encodeWebp = async (sourceFile, publicFile) => {
  await mkdir(path.dirname(publicFile), { recursive: true });
  const temporary = `${publicFile}.tmp-${process.pid}.webp`;
  await rm(temporary, { force: true });
  try {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", sourceFile,
      "-vf", "format=yuv420p", "-map_metadata", "-1", "-frames:v", "1",
      "-c:v", "libwebp", "-quality", "88", "-compression_level", "6", temporary
    ]);
    await rename(temporary, publicFile);
  } finally {
    await rm(temporary, { force: true });
  }
};

const render = async () => {
  for (const garment of Object.values(garments)) {
    await assertAsset(garment.master, { width: 1600, height: 600 });
    for (const view of Object.values(garment.views)) await assertAsset(view.base, output);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const records = {};
  try {
    const page = await browser.newPage({ viewport: output });
    for (const [slug, garment] of Object.entries(garments)) {
      const masterBytes = await readFile(path.join(siteRoot, garment.master.path));
      records[slug] = { master: garment.master, approvedHero: garment.approvedHero, views: {} };
      for (const [role, view] of Object.entries(garment.views)) {
        const artworkToOutput = homography(sourceCorners, view.artworkQuad);
        const rendered = await renderPixels(page, {
          baseBytes: await readFile(path.join(siteRoot, view.base.path)),
          masterBytes,
          artworkToOutput,
          view
        });
        const renderBytes = decodeDataUrl(rendered.render);
        const garmentMaskBytes = decodeDataUrl(rendered.garmentMask);
        const artworkMaskBytes = decodeDataUrl(rendered.artworkMask);
        const sourceRenderFile = path.join(siteRoot, view.sourceRenderPath);
        const garmentMaskFile = path.join(siteRoot, view.garmentMaskPath);
        const artworkMaskFile = path.join(siteRoot, view.artworkMaskPath);
        const publicFile = path.join(siteRoot, view.publicPath);
        await writeAtomic(sourceRenderFile, renderBytes);
        await writeAtomic(garmentMaskFile, garmentMaskBytes);
        await writeAtomic(artworkMaskFile, artworkMaskBytes);
        await encodeWebp(sourceRenderFile, publicFile);

        records[slug].views[role] = {
          publicPath: view.publicPath,
          output,
          base: view.base,
          sourceRender: asset(view.sourceRenderPath, sha256(renderBytes)),
          garmentMask: asset(view.garmentMaskPath, sha256(garmentMaskBytes)),
          appliedArtworkMask: asset(view.artworkMaskPath, sha256(artworkMaskBytes)),
          fabricModulation: {
            enabled: true,
            ...view.base,
            artworkBlendMode: view.artworkBlendMode,
            artworkOpacity: view.artworkOpacity,
            textureReturnOpacity: view.textureReturnOpacity,
            textureReturnClip: "artworkQuad"
          },
          sourceCorners,
          surfaceAnchors: view.surfaceAnchors,
          artworkQuad: view.artworkQuad,
          artworkToOutput,
          outputSha256: await fileSha256(publicFile),
          encoder
        };
      }
    }
  } finally {
    await browser.close();
  }

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
      deterministic: true
    },
    garments: records
  };
  await writeAtomic(registrationPath, Buffer.from(`${JSON.stringify(registration, null, 2)}\n`, "utf8"));
  process.stdout.write("rendered 4 apparel registrations\n");
};

const verify = async () => {
  const registration = JSON.parse(await readFile(registrationPath, "utf8"));
  if (registration.schemaVersion !== 2) throw new Error("apparel registration schema must remain v2");
  let count = 0;
  for (const [slug, garment] of Object.entries(garments)) {
    await assertAsset(garment.master, { width: 1600, height: 600 });
    const record = registration.garments?.[slug];
    if (!record) throw new Error(`missing garment registration: ${slug}`);
    for (const [role, view] of Object.entries(garment.views)) {
      const registered = record.views?.[role];
      if (!registered) throw new Error(`missing view registration: ${slug}/${role}`);
      await assertAsset(view.base, output);
      await assertAsset(registered.sourceRender, output);
      await assertAsset(registered.garmentMask, output);
      await assertAsset(registered.appliedArtworkMask, output);
      await assertAsset({ path: registered.publicPath, sha256: registered.outputSha256 }, output);
      const expectedHomography = homography(sourceCorners, view.artworkQuad);
      if (registered.artworkToOutput.length !== 9 || registered.artworkToOutput.some((value, index) => (
        Math.abs(value - expectedHomography[index]) > 1e-10
      ))) throw new Error(`homography drift: ${slug}/${role}`);
      if (JSON.stringify(registered.surfaceAnchors) !== JSON.stringify(view.surfaceAnchors)) {
        throw new Error(`surface anchor drift: ${slug}/${role}`);
      }
      if (JSON.stringify(registered.artworkQuad) !== JSON.stringify(view.artworkQuad)) {
        throw new Error(`artwork quad drift: ${slug}/${role}`);
      }
      count += 1;
    }
  }
  process.stdout.write(`verified ${count} apparel registrations\n`);
};

const args = process.argv.slice(2);
if (args.length === 0) await render();
else if (args.length === 1 && args[0] === "--verify") await verify();
else throw new Error(`unsupported apparel registration arguments: ${args.join(" ")}`);

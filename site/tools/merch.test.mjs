import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MERCH_OBJECT_DEFINITIONS,
  validateMerchLibrary
} from "../src/merch.mjs";

const LOCALES = ["en", "it", "ru"];
const ROLE_CONTRACT = {
  vinyl: ["hero", "reverse", "inner", "macro", "contents"],
  cassette: ["hero", "shell", "open", "rear", "detail"],
  cd: ["case", "disc", "open", "rear", "detail"],
  "usb-edition": ["packaging", "closed", "usb-a", "usb-c", "detail"],
  "t-shirt": ["front", "rear", "print-macro", "on-body"],
  hoodie: ["rear", "front", "print-macro", "worn-rear"],
  cap: ["front", "rear", "side-on-head", "patch-macro"],
  poster: ["diptych", "bone", "void", "material"],
  "sticker-pack": ["sheet", "peel-macro", "separated", "applied"],
  "zine-booklet": ["closed", "open", "binding", "spread-a", "spread-b", "spread-c"],
  "collector-box-set": ["closed", "open", "layer", "detail"]
};

const categories = [
  { id: "media", order: 1 },
  { id: "wear", order: 2 },
  { id: "printObjects", order: 3 }
];

const overview = Object.fromEntries(LOCALES.map((locale) => [locale, {
  title: "Merch",
  description: "POVKH LAB physical concept archive coming soon.",
  eyebrow: "Physical archive",
  heroTitle: "First physical signal",
  lede: "Physical media, apparel and printed objects.",
  status: "CONCEPT / COMING SOON",
  heroCta: "Explore objects",
  indexEyebrow: "Objects / 11",
  indexTitle: "Future editions",
  indexBody: "The first collection is shown as a concept direction.",
  roadmapEyebrow: "Roadmap / undated",
  roadmapTitle: "Directions in development",
  roadmapBody: "A working sequence without launch dates.",
  categoryLabels: { media: "Media", wear: "Wear", printObjects: "Print / objects" },
  roadmapPhases: [
    { id: "print-small", index: "01", title: "Print and small objects", body: "Printed and editorial concepts." },
    { id: "audio-media", index: "02", title: "Audio media", body: "Physical-media concepts." },
    { id: "apparel-collector", index: "03", title: "Apparel and collector editions", body: "Wearable and archive concepts." }
  ]
}]));

const shared = Object.fromEntries(LOCALES.map((locale) => [locale, {
  conceptStatus: "CONCEPT / COMING SOON",
  viewGallery: "View gallery",
  closeGallery: "Close gallery",
  previousImage: "Previous image",
  nextImage: "Next image",
  imageCounter: "Image {current} of {total}",
  storyEyebrow: "Object / concept",
  specificationsTitle: "Verified specifications",
  releaseGateTitle: "Concept only",
  backToDrop: "Back to DROP 001",
  accessTerminal: "Access Terminal",
  previousObject: "Previous object",
  nextObject: "Next object",
  galleryLabel: "Concept gallery",
  viewerLabel: "Interactive object",
  viewerActivate: "Load 3D view",
  viewerLoading: "Loading object",
  viewerReady: "3D view ready",
  viewerError: "3D view unavailable. Approved photographs remain available.",
  viewerReset: "Reset view",
  viewerInstructions: "Drag to rotate and use arrow keys to orbit.",
  viewerDataSaver: "Data Saver is active. Loading starts after this action."
}]));

const validAuthorities = () => {
  const library = {
    schemaVersion: 2,
    collectionId: "DROP-001",
    status: "comingSoon",
    stage: "concept",
    copyAuthority: "data/merch-copy-authority.json",
    assetManifest: "data/merch-asset-manifest.json",
    categories,
    objects: MERCH_OBJECT_DEFINITIONS.map(([id, slug, category], index) => ({
      id,
      slug,
      category,
      order: index + 1,
      status: "comingSoon",
      stage: "concept",
      detailEnabled: true,
      copyKey: id,
      gallery: ROLE_CONTRACT[slug].map((role) => ({
        id: `${slug}-${role}`,
        role,
        path: `assets/merch/${slug}-${role}.webp`,
        kind: "conceptRender",
        selection: "approvedConcept",
        copyKey: `${id}.gallery.${role}`,
        width: 1536,
        height: 1024
      })),
      specifications: [],
      viewer: {
        kind: "glb",
        poster: `assets/merch/${slug}-${ROLE_CONTRACT[slug][0]}.webp`,
        src: `assets/merch-3d/${slug}-${String(index + 1).padStart(3, "0")}.glb`,
        cameraOrbit: "20deg 70deg 110%",
        alt: Object.fromEntries(LOCALES.map((locale) => [locale, `Interactive 3D concept view of the ${slug} archive object.`])),
        budget: { bytes: 700000, triangles: 4000, drawCalls: 4 }
      },
      releaseGate: { state: "requiredBeforeProduction", copyKey: `${id}.releaseGate` }
    }))
  };
  const copyAuthority = {
    schemaVersion: 1,
    authority: "DROP_001_CONCEPT_COPY",
    reviewState: "approvedForConceptPreview",
    locales: LOCALES,
    overview,
    shared,
    products: Object.fromEntries(MERCH_OBJECT_DEFINITIONS.map(([id, slug]) => [id,
      Object.fromEntries(LOCALES.map((locale) => [locale, {
        name: `${slug} concept`,
        metaDescription: `${slug} selected concept render and visual direction. Concept only; coming soon.`,
        eyebrow: `${id} / CONCEPT`,
        lede: "A selected physical-object direction.",
        storyTitle: "A controlled archive object",
        storyBody: "The concept records a selected visual direction without claiming a manufactured object.",
        conceptNote: "Concept renders show design intent only.",
        releaseGate: "Physical proofs are required before production claims.",
        gallery: Object.fromEntries(ROLE_CONTRACT[slug].map((role) => [role, {
          alt: `${slug} ${role} concept render`,
          caption: `${role} / concept render`
        }])),
        specifications: {}
      }]))
    ]))
  };
  return { library, copyAuthority };
};

const readAsset = async (relative) => ({
  path: relative,
  width: 1536,
  height: 1024,
  sha256: "a".repeat(64)
});
const verifyEvidence = async ({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256);

test("accepts and resolves the exact DROP 001 concept registry", async () => {
  const { library, copyAuthority } = validAuthorities();
  const resolved = await validateMerchLibrary(library, copyAuthority, { readAsset, verifyEvidence });
  assert.deepEqual(resolved.content, overview);
  assert.deepEqual(resolved.copy, shared);
  assert.deepEqual(resolved.objects[0].content.en, copyAuthority.products["MRCH-001"].en);
  assert.deepEqual(resolved.objects[0].gallery[0].alt, {
    en: "vinyl hero concept render",
    it: "vinyl hero concept render",
    ru: "vinyl hero concept render"
  });
  assert.deepEqual(resolved.objects[0].gallery[0].caption, {
    en: "hero / concept render",
    it: "hero / concept render",
    ru: "hero / concept render"
  });
});

test("requires schema v2 concept and coming-soon state", async () => {
  const { library, copyAuthority } = validAuthorities();
  library.stage = "production";
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset }), /schemaVersion 2.*concept.*comingSoon/);
});

test("requires all 50 gallery roles in immutable order", async () => {
  const { library, copyAuthority } = validAuthorities();
  library.objects[0].gallery.reverse();
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset }), /gallery roles must match the immutable contract/);
});

test("requires conceptRender and approvedConcept on every image", async () => {
  const { library, copyAuthority } = validAuthorities();
  library.objects[0].gallery[0].kind = "photograph";
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset }), /conceptRender and approvedConcept/);
});

test("resolves every EN IT RU copy key including alt and caption", async () => {
  const { library, copyAuthority } = validAuthorities();
  const resolved = await validateMerchLibrary(library, copyAuthority, { readAsset });
  assert.deepEqual(Object.keys(resolved.objects[10].content), LOCALES);
  assert.deepEqual(Object.keys(resolved.objects[10].gallery[3].alt), LOCALES);
  assert.deepEqual(Object.keys(resolved.objects[10].gallery[3].caption), LOCALES);
});

test("rejects recursive commerce fields and commerce copy", async () => {
  const { library, copyAuthority } = validAuthorities();
  library.objects[0].releaseGate.price = 20;
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset }), /forbidden commerce field price/);
  delete library.objects[0].releaseGate.price;
  copyAuthority.products["MRCH-001"].en.storyBody = "Buy now from the archive.";
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset }), /commercial copy/);
});

test("rejects unverified specifications or missing evidence hashes", async () => {
  const { library, copyAuthority } = validAuthorities();
  library.objects[0].specifications.push({
    key: "format",
    verified: false,
    copyKey: "MRCH-001.specifications.format",
    evidence: { path: "evidence/format.txt", sha256: "a".repeat(64) }
  });
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset, verifyEvidence }), /specification format must be verified/);
  library.objects[0].specifications[0].verified = true;
  library.objects[0].specifications[0].evidence.sha256 = "bad";
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset, verifyEvidence }), /evidence hash/);
});

test("rejects copy parity gaps across locales", async () => {
  const { library, copyAuthority } = validAuthorities();
  delete copyAuthority.products["MRCH-011"].ru.gallery.detail.caption;
  await assert.rejects(validateMerchLibrary(library, copyAuthority, { readAsset }), /MRCH-011.*ru.*detail.*caption/);
});

test("the production merch authorities pass the joined contract", async () => {
  const library = JSON.parse(await readFile(new URL("../data/merch.json", import.meta.url), "utf8"));
  const copyAuthority = JSON.parse(await readFile(new URL("../data/merch-copy-authority.json", import.meta.url), "utf8"));
  const productionReadAsset = async (relative) => {
    const image = library.objects.flatMap((object) => object.gallery).find(({ path }) => path === relative);
    return image ? { path: relative, width: image.width, height: image.height, sha256: "b".repeat(64) } : null;
  };
  const resolved = await validateMerchLibrary(library, copyAuthority, { readAsset: productionReadAsset, verifyEvidence });
  assert.deepEqual(resolved.objects.map(({ id }) => id), MERCH_OBJECT_DEFINITIONS.map(([id]) => id));
});

test("the production concepts have 33 distinct editorial stories", async () => {
  const copyAuthority = JSON.parse(await readFile(new URL("../data/merch-copy-authority.json", import.meta.url), "utf8"));
  for (const locale of LOCALES) {
    const stories = Object.values(copyAuthority.products).map((product) => product[locale]);
    assert.equal(new Set(stories.map(({ storyTitle }) => storyTitle)).size, 11, `${locale} story titles must be distinct`);
    assert.equal(new Set(stories.map(({ storyBody }) => storyBody)).size, 11, `${locale} story bodies must be distinct`);
    assert.ok(stories.every(({ storyBody }) => !/views test|viste verificano|Виды проверяют/.test(storyBody)), `${locale} still contains template story copy`);
  }
});

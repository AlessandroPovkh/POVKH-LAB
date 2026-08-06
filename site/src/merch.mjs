export const MERCH_LOCALES = ["en", "it", "ru"];
export const MERCH_CATEGORY_IDS = ["media", "wear", "printObjects"];
export const MERCH_OBJECT_DEFINITIONS = [
  ["MRCH-001", "vinyl", "media"],
  ["MRCH-002", "cassette", "media"],
  ["MRCH-003", "cd", "media"],
  ["MRCH-004", "usb-edition", "media"],
  ["MRCH-005", "t-shirt", "wear"],
  ["MRCH-006", "hoodie", "wear"],
  ["MRCH-007", "cap", "wear"],
  ["MRCH-008", "poster", "printObjects"],
  ["MRCH-009", "sticker-pack", "printObjects"],
  ["MRCH-010", "zine-booklet", "printObjects"],
  ["MRCH-011", "collector-box-set", "printObjects"]
];
export const MERCH_GALLERY_ROLES = Object.freeze({
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
});
export const merchObjectRoute = (slug) => `merch/${slug}`;

const PAGE_FIELDS = [
  "title", "description", "eyebrow", "heroTitle", "lede", "status",
  "heroCta", "indexEyebrow", "indexTitle", "indexBody",
  "roadmapEyebrow", "roadmapTitle", "roadmapBody"
];
const SHARED_FIELDS = [
  "conceptStatus", "viewGallery", "closeGallery", "previousImage", "nextImage",
  "imageCounter", "storyEyebrow", "specificationsTitle", "releaseGateTitle",
  "backToDrop", "accessTerminal", "previousObject", "nextObject", "galleryLabel",
  "viewerLabel", "viewerActivate", "viewerLoading", "viewerReady", "viewerError",
  "viewerReset", "viewerInstructions", "viewerDataSaver"
];
const PRODUCT_COPY_FIELDS = [
  "name", "metaDescription", "eyebrow", "lede", "storyTitle", "storyBody",
  "conceptNote", "releaseGate"
];
const ROADMAP_IDS = ["print-small", "audio-media", "apparel-collector"];
const FORBIDDEN_FIELDS = new Set([
  "price", "currency", "stock", "inventory", "quantity", "sizes", "shipping",
  "checkoutUrl", "cart", "preorderUrl", "editionSize", "sku", "availability",
  "offers", "product"
].map((field) => field.toLowerCase()));
const COMMERCE_COPY = /\b(?:buy|order now|pre[- ]?order|preorder|in stock|sold out|shipping|checkout|price|currency|available now|acquista|ordina ora|preordine|disponibile ora|in magazzino|esaurito|spedizione|prezzo|valuta|купить|заказать сейчас|предзаказ|в наличии|распродано|доставка|оформить заказ|цена|валюта|доступно сейчас)\b/iu;
const nonEmpty = (value) => typeof value === "string" && Boolean(value.trim());
const safeSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || "");
const safeSpecificationKey = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value || "");
const safeProjectPath = (value) => /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?![a-z][a-z0-9+.-]*:)[A-Za-z0-9._/-]+$/i.test(value || "");
const exactKeys = (value, keys) => JSON.stringify(Object.keys(value || {})) === JSON.stringify(keys);
const exactKeySet = (value, keys) => JSON.stringify(Object.keys(value || {}).sort()) === JSON.stringify([...keys].sort());

const validateViewer = (object) => {
  const viewer = object.viewer;
  if (!viewer || !["glb", "spin"].includes(viewer.kind)) throw new Error(`${object.id} viewer must declare glb or spin`);
  const keys = viewer.kind === "glb"
    ? ["kind", "poster", "src", "cameraOrbit", "alt", "budget"]
    : ["kind", "poster", "src", "alt", "budget"];
  if (!exactKeySet(viewer, keys)) throw new Error(`${object.id} viewer must use the exact ${viewer.kind} contract`);
  if (viewer.poster !== object.gallery[0]?.path || !safeProjectPath(viewer.poster)) {
    throw new Error(`${object.id} viewer poster must reuse the approved hero asset`);
  }
  if (!safeProjectPath(viewer.src)) throw new Error(`${object.id} viewer source must be a base-safe project path`);
  if (!exactKeySet(viewer.alt, MERCH_LOCALES)) throw new Error(`${object.id} viewer alt must preserve EN IT RU parity`);
  for (const locale of MERCH_LOCALES) {
    if (!nonEmpty(viewer.alt[locale]) || viewer.alt[locale].length < 12 || viewer.alt[locale].length > 180) {
      throw new Error(`${object.id} viewer alt.${locale} must contain 12–180 characters`);
    }
  }
  if (viewer.kind === "glb") {
    if (!/^assets\/merch-3d\/[a-z0-9-]+\.glb$/.test(viewer.src)) throw new Error(`${object.id} GLB source path is invalid`);
    if (!/^-?\d+(?:\.\d+)?deg \d+(?:\.\d+)?deg \d+(?:\.\d+)?%$/.test(viewer.cameraOrbit || "")) {
      throw new Error(`${object.id} viewer camera orbit is invalid`);
    }
    if (!exactKeySet(viewer.budget, ["bytes", "triangles", "drawCalls"])
      || !Number.isInteger(viewer.budget.bytes) || viewer.budget.bytes < 1
      || !Number.isInteger(viewer.budget.triangles) || viewer.budget.triangles < 0
      || !Number.isInteger(viewer.budget.drawCalls) || viewer.budget.drawCalls < 0) {
      throw new Error(`${object.id} GLB viewer budget is invalid`);
    }
  } else {
    if (!/^assets\/merch-360\/[a-z0-9-]+\/manifest\.json$/.test(viewer.src)) throw new Error(`${object.id} spin source path is invalid`);
    if (!exactKeySet(viewer.budget, ["mobileBytes", "desktopBytes", "mobileFrames", "desktopFrames"])
      || Object.values(viewer.budget).some((value) => !Number.isInteger(value) || value < 1)) {
      throw new Error(`${object.id} spin viewer budget is invalid`);
    }
  }
};

const rejectForbiddenFields = (value, path = "merch") => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenFields(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key.toLowerCase())) throw new Error(`${path} uses forbidden commerce field ${key}`);
    rejectForbiddenFields(entry, `${path}.${key}`);
  }
};

const rejectCommercialCopy = (value, path = "copy") => {
  if (typeof value === "string") {
    if (COMMERCE_COPY.test(value)) throw new Error(`${path} contains commercial copy`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) rejectCommercialCopy(entry, `${path}.${key}`);
};

const validateOverview = (authority) => {
  if (!exactKeys(authority.overview, MERCH_LOCALES)) throw new Error("copy overview must preserve EN IT RU parity");
  for (const locale of MERCH_LOCALES) {
    const copy = authority.overview[locale];
    for (const field of PAGE_FIELDS) {
      if (!nonEmpty(copy?.[field])) throw new Error(`overview.${locale}.${field} must be a non-empty string`);
    }
    if (copy.description.length > 160) throw new Error(`overview.${locale}.description must be at most 160 characters`);
    if (!exactKeys(copy.categoryLabels, MERCH_CATEGORY_IDS)
      || MERCH_CATEGORY_IDS.some((id) => !nonEmpty(copy.categoryLabels[id]))) {
      throw new Error(`overview.${locale}.categoryLabels must contain the approved categories`);
    }
    if (!Array.isArray(copy.roadmapPhases)
      || JSON.stringify(copy.roadmapPhases.map(({ id }) => id)) !== JSON.stringify(ROADMAP_IDS)) {
      throw new Error(`overview.${locale}.roadmapPhases must use the approved order`);
    }
    for (const phase of copy.roadmapPhases) {
      for (const field of ["index", "title", "body"]) {
        if (!nonEmpty(phase[field])) throw new Error(`overview.${locale}.${phase.id}.${field} must be non-empty`);
      }
    }
  }
};

const validateShared = (authority) => {
  if (!exactKeys(authority.shared, MERCH_LOCALES)) throw new Error("shared copy must preserve EN IT RU parity");
  for (const locale of MERCH_LOCALES) {
    if (!exactKeySet(authority.shared[locale], SHARED_FIELDS)) throw new Error(`shared.${locale} must use the approved control keys`);
    for (const field of SHARED_FIELDS) {
      if (!nonEmpty(authority.shared[locale][field])) throw new Error(`shared.${locale}.${field} must be a non-empty string`);
    }
  }
};

export const validateMerchLibrary = async (
  library,
  copyAuthority,
  { readAsset = async () => null, verifyEvidence = async () => false } = {}
) => {
  if (library?.schemaVersion !== 2 || library.collectionId !== "DROP-001"
    || library.status !== "comingSoon" || library.stage !== "concept") {
    throw new Error("merch.json must use schemaVersion 2 with concept stage and comingSoon status");
  }
  if (library.copyAuthority !== "data/merch-copy-authority.json"
    || library.assetManifest !== "data/merch-asset-manifest.json") {
    throw new Error("merch.json authority paths do not match the schema v2 contract");
  }
  rejectForbiddenFields(library);
  if (!Array.isArray(library.categories)
    || JSON.stringify(library.categories) !== JSON.stringify(
      MERCH_CATEGORY_IDS.map((id, index) => ({ id, order: index + 1 }))
    )) {
    throw new Error("merch categories must use the approved order");
  }
  if (!copyAuthority || copyAuthority.schemaVersion !== 1
    || copyAuthority.authority !== "DROP_001_CONCEPT_COPY"
    || copyAuthority.reviewState !== "approvedForConceptPreview"
    || JSON.stringify(copyAuthority.locales) !== JSON.stringify(MERCH_LOCALES)) {
    throw new Error("copy authority must use the approved schema, review state and EN IT RU order");
  }
  rejectForbiddenFields(copyAuthority, "copy authority");
  rejectCommercialCopy(copyAuthority);
  validateOverview(copyAuthority);
  validateShared(copyAuthority);
  if (!Array.isArray(library.objects) || library.objects.length !== MERCH_OBJECT_DEFINITIONS.length) {
    throw new Error(`merch objects must contain exactly ${MERCH_OBJECT_DEFINITIONS.length} entries`);
  }
  if (!exactKeys(copyAuthority.products, MERCH_OBJECT_DEFINITIONS.map(([id]) => id))) {
    throw new Error("copy authority products must preserve immutable object order");
  }

  const resolved = structuredClone(library);
  resolved.content = structuredClone(copyAuthority.overview);
  resolved.copy = structuredClone(copyAuthority.shared);
  const ids = new Set();
  const slugs = new Set();
  const assetPaths = new Set();
  let galleryCount = 0;

  for (const [index, object] of library.objects.entries()) {
    const [id, slug, category] = MERCH_OBJECT_DEFINITIONS[index];
    if (ids.has(object.id)) throw new Error(`Duplicate merch ID: ${object.id}`);
    if (slugs.has(object.slug)) throw new Error(`Duplicate merch slug: ${object.slug}`);
    if (object.id !== id || object.slug !== slug || object.category !== category || object.order !== index + 1) {
      throw new Error(`merch object ${index + 1} must be ${id} / ${slug} / ${category}`);
    }
    if (!safeSlug(object.slug)) throw new Error(`${object.id} must use a safe slug`);
    if (!exactKeySet(object, [
      "id", "slug", "category", "order", "status", "stage", "detailEnabled", "copyKey",
      "gallery", "specifications", "viewer", "releaseGate"
    ])) throw new Error(`${object.id} must use the exact schema v2 object keys`);
    if (object.status !== "comingSoon" || object.stage !== "concept" || object.detailEnabled !== true) {
      throw new Error(`${object.id} must declare concept, comingSoon and enabled detail state`);
    }
    if (object.copyKey !== object.id) throw new Error(`${object.id} copyKey must equal its immutable ID`);
    const roles = MERCH_GALLERY_ROLES[slug];
    if (!Array.isArray(object.gallery)
      || JSON.stringify(object.gallery.map(({ role }) => role)) !== JSON.stringify(roles)) {
      throw new Error(`${object.id} gallery roles must match the immutable contract`);
    }
    if (!Array.isArray(object.specifications)) throw new Error(`${object.id} specifications must be an array`);
    validateViewer(object);
    if (!exactKeySet(object.releaseGate, ["state", "copyKey"])
      || object.releaseGate.state !== "requiredBeforeProduction"
      || object.releaseGate.copyKey !== `${object.id}.releaseGate`) {
      throw new Error(`${object.id} release gate must remain required before production`);
    }

    const productCopy = copyAuthority.products[object.id];
    if (!exactKeys(productCopy, MERCH_LOCALES)) throw new Error(`${object.id} copy must preserve EN IT RU parity`);
    for (const locale of MERCH_LOCALES) {
      const localized = productCopy[locale];
      for (const field of PRODUCT_COPY_FIELDS) {
        if (!nonEmpty(localized?.[field])) throw new Error(`${object.id}.${locale}.${field} must be a non-empty string`);
      }
      if (localized.metaDescription.length > 160) throw new Error(`${object.id}.${locale}.metaDescription must be at most 160 characters`);
      if (!exactKeys(localized.gallery, roles)) throw new Error(`${object.id}.${locale} gallery copy must preserve immutable role order`);
      for (const role of roles) {
        for (const field of ["alt", "caption"]) {
          if (!nonEmpty(localized.gallery[role]?.[field])) {
            throw new Error(`${object.id}.${locale}.${role}.${field} must be a non-empty string`);
          }
        }
      }
      if (!localized.specifications || typeof localized.specifications !== "object" || Array.isArray(localized.specifications)) {
        throw new Error(`${object.id}.${locale}.specifications must be an object`);
      }
    }

    const resolvedObject = resolved.objects[index];
    resolvedObject.content = Object.fromEntries(MERCH_LOCALES.map((locale) => [locale, structuredClone(productCopy[locale])]));
    resolvedObject.releaseGate.copy = Object.fromEntries(MERCH_LOCALES.map((locale) => [locale, productCopy[locale].releaseGate]));

    for (const [galleryIndex, image] of object.gallery.entries()) {
      const role = roles[galleryIndex];
      if (!exactKeySet(image, ["id", "role", "path", "kind", "selection", "copyKey", "width", "height"])) {
        throw new Error(`${object.id} gallery ${role} must use the exact schema v2 keys`);
      }
      if (image.id !== `${slug}-${role}` || image.copyKey !== `${object.id}.gallery.${role}`) {
        throw new Error(`${object.id} gallery ${role} identity or copyKey mismatch`);
      }
      if (image.kind !== "conceptRender" || image.selection !== "approvedConcept") {
        throw new Error(`${object.id} gallery images must use conceptRender and approvedConcept`);
      }
      if (image.path !== `assets/merch/${slug}-${role}.webp` || assetPaths.has(image.path)) {
        throw new Error(`${object.id} gallery ${role} path must be unique and role-based`);
      }
      if (!Number.isInteger(image.width) || image.width < 1 || !Number.isInteger(image.height) || image.height < 1) {
        throw new Error(`${object.id} gallery ${role} dimensions must be positive integers`);
      }
      const asset = await readAsset(image.path);
      if (!asset) throw new Error(`${object.id} gallery ${role} asset is missing`);
      if (asset.width !== image.width || asset.height !== image.height) {
        throw new Error(`${object.id} gallery ${role} dimensions do not match the public asset`);
      }
      resolvedObject.gallery[galleryIndex].alt = Object.fromEntries(
        MERCH_LOCALES.map((locale) => [locale, productCopy[locale].gallery[role].alt])
      );
      resolvedObject.gallery[galleryIndex].caption = Object.fromEntries(
        MERCH_LOCALES.map((locale) => [locale, productCopy[locale].gallery[role].caption])
      );
      assetPaths.add(image.path);
      galleryCount += 1;
    }

    for (const [specIndex, specification] of object.specifications.entries()) {
      if (!safeSpecificationKey(specification?.key)) throw new Error(`${object.id} specification key must be a safe identifier`);
      if (specification.verified !== true) throw new Error(`${object.id} specification ${specification.key} must be verified`);
      if (!exactKeySet(specification, ["key", "verified", "copyKey", "evidence"])) {
        throw new Error(`${object.id} specification ${specification.key} must use the evidence-bound schema`);
      }
      if (specification.copyKey !== `${object.id}.specifications.${specification.key}`) {
        throw new Error(`${object.id} specification ${specification.key} copyKey mismatch`);
      }
      const evidence = specification.evidence;
      if (!evidence || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+/.test(evidence.path || "")
        || !/^[a-f0-9]{64}$/.test(evidence.sha256 || "")) {
        throw new Error(`${object.id} specification ${specification.key} evidence hash or path is invalid`);
      }
      if (!await verifyEvidence(evidence)) throw new Error(`${object.id} specification ${specification.key} evidence hash is unverified`);
      const label = {};
      const value = {};
      for (const locale of MERCH_LOCALES) {
        const localized = productCopy[locale].specifications[specification.key];
        if (!nonEmpty(localized?.label) || !nonEmpty(localized?.value)) {
          throw new Error(`${object.id}.${locale}.specifications.${specification.key} copy is incomplete`);
        }
        label[locale] = localized.label;
        value[locale] = localized.value;
      }
      resolvedObject.specifications[specIndex].label = label;
      resolvedObject.specifications[specIndex].value = value;
    }
    ids.add(object.id);
    slugs.add(object.slug);
  }
  if (galleryCount !== 50) throw new Error("DROP 001 must contain exactly 50 gallery roles");
  return resolved;
};

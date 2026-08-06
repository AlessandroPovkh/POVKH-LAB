import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
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
const repoRoot = path.dirname(siteRoot);
const manifestPath = path.join(siteRoot, "data", "merch-asset-manifest.json");
const ENCODER = "ffmpeg/libwebp q=88 yuv420p metadata-stripped";
const SCALE_FILTER = "scale=w=if(gt(iw\\,ih)\\,min(2000\\,iw)\\,-2):h=if(gt(iw\\,ih)\\,-2\\,min(2000\\,ih)):flags=lanczos,format=yuv420p";

const mapping = (objectId, slug, role, source, sourceSha256) => ({
  objectId,
  slug,
  role,
  source,
  sourceSha256,
  publicPath: `assets/merch/${slug}-${role}.webp`
});

export const SOURCE_MAPPINGS = [
  mapping("MRCH-001", "vinyl", "hero", "production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/renders/PVKH_DROP001_VINYL_SIGNAL_RED_PHYSICAL_MASTER_FULL_KIT_HERO_CONCEPT_v05.png", "43cbdb58915a7b43b8d64f6f46582f3393c51069d11e62b8c6e2be33e0acdedc"),
  mapping("MRCH-001", "vinyl", "reverse", "production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/renders/PVKH_DROP001_VINYL_SIGNAL_RED_PHYSICAL_MASTER_SLEEVE_REVERSE_CONCEPT_v05.png", "f9c7f42fee9465f4cff5343cb168334eeca54b89db001617fbcb7fb7a62ae9ec"),
  mapping("MRCH-001", "vinyl", "inner", "production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/renders/PVKH_DROP001_VINYL_SIGNAL_RED_PHYSICAL_MASTER_INNER_REVEAL_CONCEPT_v05.png", "cde7d1ac75ab186ff0f640cbd471f9a42bcdba19f3e891cf45dcb67be19fa11e"),
  mapping("MRCH-001", "vinyl", "macro", "production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/renders/PVKH_DROP001_VINYL_SIGNAL_RED_PHYSICAL_MASTER_LABEL_MATERIAL_MACRO_CONCEPT_v05.png", "2fb481313d5872653588b3498278ce2bb5aec9e240f0722a52bbc9b4cb02aa9c"),
  mapping("MRCH-001", "vinyl", "contents", "production/physical-merch/concepts/drop-001/renders/vinyl/smoke-archive/renders/PVKH_DROP001_VINYL_SIGNAL_RED_PHYSICAL_MASTER_COMPLETE_CONTENTS_CONCEPT_v05.png", "4683d6496b0dee949c98ddfc68b969c02e16c630ce4bc63b352facf8d1d6064b"),

  mapping("MRCH-002", "cassette", "hero", "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/renders/PVKH_DROP001_CASSETTE_002_FRONT_HERO_CONCEPT_v01.png", "a35547129c8eac31dff8997d8b57e4109efe12ed54563fc4530881da34dacd82"),
  mapping("MRCH-002", "cassette", "shell", "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/renders/PVKH_DROP001_CASSETTE_002_SHELL_HERO_CONCEPT_v01.png", "24ffdc837bdaa5b74e5f641e16d500198bef9f8a00ab4af11cb77b1b83d52253"),
  mapping("MRCH-002", "cassette", "open", "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/renders/PVKH_DROP001_CASSETTE_002_OPEN_SET_CONCEPT_v01.png", "abf0d4213adb58c106b9b91f94ef38ad86775101772de5e54b950f259dbf293d"),
  mapping("MRCH-002", "cassette", "rear", "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/renders/PVKH_DROP001_CASSETTE_002_REAR_FOLD_CONCEPT_v01.png", "b9416f7e68366100672c0a7e210affc1cb9df2166ae3d86f3b5ede153b9eaae0"),
  mapping("MRCH-002", "cassette", "detail", "production/physical-merch/concepts/drop-001/renders/archive-objects/cassette-002/renders/PVKH_DROP001_CASSETTE_002_MATERIAL_DETAIL_CONCEPT_v01.png", "e465e4339b993a3861eb185dfd3b1e0646b8f3a944732a953093750b6dd88837"),

  mapping("MRCH-003", "cd", "case", "production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/renders/selected/PVKH_DROP001_DISC_004_CASE_HERO_CONCEPT_v01.png", "bb30752d3f2e061ceca9c0ef7c1fb9779c0ddaa836add1e29e4198660254d2a5"),
  mapping("MRCH-003", "cd", "disc", "production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/renders/selected/PVKH_DROP001_DISC_004_DISC_HERO_CONCEPT_v01.png", "e010b397d11116f4e9aa96cc300cdf44f74713764c116f242e43d32fcdea4504"),
  mapping("MRCH-003", "cd", "open", "production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/renders/selected/PVKH_DROP001_DISC_004_OPEN_SET_CONCEPT_v01.png", "4f3edba72b28cca7e0cfde9063cd869c38074dffa3d1fc528a3f6c4669638d05"),
  mapping("MRCH-003", "cd", "rear", "production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/renders/selected/PVKH_DROP001_DISC_004_REAR_SPINE_CONCEPT_v01.png", "0abe870cea9cb34dd8138358f969806eeba22d2907b965aac0ad0b54df595102"),
  mapping("MRCH-003", "cd", "detail", "production/physical-merch/concepts/drop-001/renders/archive-objects/disc-004/renders/selected/PVKH_DROP001_DISC_004_MATERIAL_DETAIL_CONCEPT_v01.png", "c9d2bcb236222b652ea2401b8b20f80af26b7b52bbac3c6b5ac746b312fd0e72"),

  mapping("MRCH-004", "usb-edition", "packaging", "production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/renders/PVKH_DROP001_DATA_KEY_003_PACKAGING_SET_CONCEPT_v01.png", "f8fc559811d7fdf88ce717a630a37d92a3372387c49f0b95f7405b47586468e8"),
  mapping("MRCH-004", "usb-edition", "closed", "production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/renders/PVKH_DROP001_DATA_KEY_003_CLOSED_HERO_CONCEPT_v01.png", "7e66a48ec57a395080522c19e802f82bb9f7cd982a34d7579e00dd25d80cbd89"),
  mapping("MRCH-004", "usb-edition", "usb-a", "production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/renders/PVKH_DROP001_DATA_KEY_003_USB_A_EXTENDED_CONCEPT_v01.png", "e299a335bc46a148f934a63389db5aec23d7de50b2c9161a63b7954fb6d3bfaa"),
  mapping("MRCH-004", "usb-edition", "usb-c", "production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/renders/PVKH_DROP001_DATA_KEY_003_USB_C_EXTENDED_CONCEPT_v01.png", "171ea67662ee14c5fc22afd0a15af2163c59d8ede6c5d8131d1ea54b2545610b"),
  mapping("MRCH-004", "usb-edition", "detail", "production/physical-merch/concepts/drop-001/renders/archive-objects/data-key-003/renders/PVKH_DROP001_DATA_KEY_003_MATERIAL_LASER_DETAIL_CONCEPT_v01.png", "946d088c561607730b1722870560dac74170519a7feaff30b6c3d2983ca22425"),

  mapping("MRCH-005", "t-shirt", "front", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/renders/PVKH_DROP001_BONE_SOURCE_TEE_CONCEPT_v03.png", "6f8a5fe9aaea013e7f445dcd9a3866d5501eae63ae57d4e7a9fca0c0cfd9f193"),
  mapping("MRCH-005", "t-shirt", "rear", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/renders/gallery-v01/PVKH_DROP001_BONE_SOURCE_TEE_REAR_FLATLAY_CONCEPT_v01.png", "f8844030a4aa7a01f29d39e08410bc9299b33250921575fe749e53123a368147"),
  mapping("MRCH-005", "t-shirt", "print-macro", "site/tools/fixtures/apparel-registration/renders/t-shirt-print-macro-registration-v02.png", "edfc22ca08aa9d62b2c5f49790853c2679997c1d896720b9aadb7ce1f286ab6a"),
  mapping("MRCH-005", "t-shirt", "on-body", "site/tools/fixtures/apparel-registration/renders/t-shirt-on-body-registration-v02.png", "5a21ad6ebb775ac3b16a3c1907eec2aca52d8779489bcffd819bca6fc41189f7"),

  mapping("MRCH-006", "hoodie", "rear", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/renders/PVKH_DROP001_VOID_BACKMARK_HOODIE_CONCEPT_v09.png", "66fd2ab026b9135af7ea1bbe07e7dce32d73392f470ac2b1355c367fcd7b8645"),
  mapping("MRCH-006", "hoodie", "front", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/renders/gallery-v01/PVKH_DROP001_VOID_BACKMARK_HOODIE_FRONT_FLATLAY_CONCEPT_v01.png", "0e687da476ba55adf820d315df911e71c057a7fab0ec7a274d240597830b7d17"),
  mapping("MRCH-006", "hoodie", "print-macro", "site/tools/fixtures/apparel-registration/renders/hoodie-print-macro-registration-v02.png", "fa59bfe3647119262d46b5ec9f4b8f6870ba827a6012cf88e7b777d7814a46b3"),
  mapping("MRCH-006", "hoodie", "worn-rear", "site/tools/fixtures/apparel-registration/renders/hoodie-worn-rear-registration-v02.png", "7ba52a0c0233114bc66429bb443145633eff116078ffa543daf1b8570c7e19f2"),

  mapping("MRCH-007", "cap", "front", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/cap-field-issue/renders/PVKH_DROP001_FIELD_ISSUE_CAP_FRONT_CONCEPT_v01.png", "066c0c8b1b64d48205bd888bd469f0f515771bfb7af918fc286977ddd314fe5a"),
  mapping("MRCH-007", "cap", "rear", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/cap-field-issue/renders/PVKH_DROP001_FIELD_ISSUE_CAP_REAR_DETAIL_CONCEPT_v01.png", "162ec7666a155900c67b265d344da35d87d6e47d8768de07ec0cea02969e8407"),
  mapping("MRCH-007", "cap", "side-on-head", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/renders/gallery-v01/PVKH_DROP001_FIELD_ISSUE_CAP_ON_HEAD_SIDE_CONCEPT_v01.png", "146c22fb191ed25d60dc222daad2b14dce9ddc5f63231a64b2a4041ddad7d6c8"),
  mapping("MRCH-007", "cap", "patch-macro", "production/physical-merch/concepts/drop-001/explorations/ascii-bullet/revised-capsule/renders/gallery-v01/PVKH_DROP001_FIELD_ISSUE_CAP_PATCH_STITCH_MACRO_CONCEPT_v01.png", "8cd64cfd502f3e64ac07399c479eae5affbb886ac5c98f66ae57a93dd0b740cd"),

  mapping("MRCH-008", "poster", "diptych", "production/physical-merch/concepts/drop-001/renders/archive-objects/print-001/renders/selected-pair/PVKH_DROP001_PRINT_001_DIPTYCH_SET_CONCEPT_v01.png", "84d851ff3bc87cd390c13c4498575cf91ec228f1f67f0a9803828f5534d5b3c5"),
  mapping("MRCH-008", "poster", "bone", "production/physical-merch/concepts/drop-001/renders/archive-objects/print-001/renders/selected-pair/PVKH_DROP001_PRINT_001_A_FRONT_HERO_CONCEPT_v01.png", "3f4f0a76d72c44b38287e8dcc409df1852204bbed7c855abf46a793e0cd25a16"),
  mapping("MRCH-008", "poster", "void", "production/physical-merch/concepts/drop-001/renders/archive-objects/print-001/renders/selected-pair/PVKH_DROP001_PRINT_001_B_FRONT_HERO_CONCEPT_v01.png", "04cb4558d3ef06018fd5d75eb5586b596817cb9e369ae985f0e39f2e29782d57"),
  mapping("MRCH-008", "poster", "material", "production/physical-merch/concepts/drop-001/renders/archive-objects/print-001/renders/selected-pair/PVKH_DROP001_PRINT_001_A_INK_FIBER_DETAIL_CONCEPT_v01.png", "e22f7248d2ee7f83996a3b70f0f9a377bb006cfda3af858f8e863bc715cff0fb"),

  mapping("MRCH-009", "sticker-pack", "sheet", "production/physical-merch/concepts/drop-001/renders/archive-objects/signal-kit-001/renders/gallery/PVKH_DROP001_SIGNAL_KIT_001_SELECTED_SHEET_PRODUCTION_CONCEPT_v06.png", "dba69b9b616452f949763690d21208cf6dd61804cb15ee3fc2e5c59ebd3bf050"),
  mapping("MRCH-009", "sticker-pack", "peel-macro", "production/physical-merch/concepts/drop-001/renders/archive-objects/signal-kit-001/renders/gallery/PVKH_DROP001_SIGNAL_KIT_001_PEEL_EDGE_MACRO_PRODUCTION_CONCEPT_v06.png", "50fc0ed444d3744a46c5a8c4f7472db4d6a015559d0e681f130e12a2edc380fa"),
  mapping("MRCH-009", "sticker-pack", "separated", "production/physical-merch/concepts/drop-001/renders/archive-objects/signal-kit-001/renders/gallery/PVKH_DROP001_SIGNAL_KIT_001_SEPARATED_SET_PRODUCTION_CONCEPT_v06.png", "b47596cf8523a4418e4827fbf19058fef4290139852c2484d96a70f56702802a"),
  mapping("MRCH-009", "sticker-pack", "applied", "production/physical-merch/concepts/drop-001/renders/archive-objects/signal-kit-001/renders/gallery/PVKH_DROP001_SIGNAL_KIT_001_APPLIED_SURFACE_PRODUCTION_CONCEPT_v06.png", "60583434d000a675b0c57c4b297243c048b4ef5379c5ddf9ee2abb95c1747372"),

  mapping("MRCH-010", "zine-booklet", "closed", "production/physical-merch/concepts/drop-001/renders/archive-objects/zine-001/renders/PVKH_ZINE_001_INK_PRESSURE_CLOSED_HERO_CONCEPT_v01.png", "1d24ec4170335fc4868b288a02f550d65b78dfb0af9931f719e28b47b50b68a2"),
  mapping("MRCH-010", "zine-booklet", "open", "production/physical-merch/concepts/drop-001/renders/archive-objects/zine-001/renders/PVKH_ZINE_001_TITLE_THRESHOLD_NATURAL_MOCKUP_v01.png", "7310ceecfd1abd2fae3b5721739e972aba72bd36b10a353be2ac8b7859a472f3"),
  mapping("MRCH-010", "zine-booklet", "binding", "production/physical-merch/concepts/drop-001/renders/archive-objects/zine-001/renders/PVKH_ZINE_001_INK_PRESSURE_BINDING_DETAIL_CONCEPT_v01.png", "2db100bbbca3179e4673b10a006538cf4c421627ab61bc5b083a7cb221da10e2"),
  mapping("MRCH-010", "zine-booklet", "spread-a", "production/physical-merch/concepts/drop-001/renders/archive-objects/zine-001/renders/PVKH_ZINE_001_FRAGMENT_STUDY_CLEAN_NATURAL_MOCKUP_v06.png", "3c7cd795b45274bfb7b028f0bf469f824ad7d2545a94296f205de54fe1216b50"),
  mapping("MRCH-010", "zine-booklet", "spread-b", "production/physical-merch/concepts/drop-001/renders/archive-objects/zine-001/renders/PVKH_ZINE_001_PRESSURE_SKIN_NATURAL_MOCKUP_v02.png", "2a41ece9c69fba1eeedb20ea2313d2a75ca8645186c71510aa94446d6edebb41"),
  mapping("MRCH-010", "zine-booklet", "spread-c", "production/physical-merch/concepts/drop-001/renders/archive-objects/zine-001/renders/PVKH_ZINE_001_IMPACT_MEMORY_NATURAL_MOCKUP_v02.png", "240b51e4366f0023609be0ec5f7e71a6256dc958009e6ce19141b42a5286ebdd"),

  mapping("MRCH-011", "collector-box-set", "closed", "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/renders/selected/PVKH_DROP001_COLLECTOR_BOX_001_CLOSED_HERO_CONCEPT_v02.png", "07a84bdcc039eb10038ce5a6486cda4bbe1455f01572307e78d9c646add8408e"),
  mapping("MRCH-011", "collector-box-set", "open", "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/renders/selected/PVKH_DROP001_COLLECTOR_BOX_001_OPEN_FINAL_CONTENTS_CONCEPT_v04.png", "39fb9506f9274ba1aaceb0848b24de33fbb18898d2732440097e4d2f83862294"),
  mapping("MRCH-011", "collector-box-set", "layer", "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/renders/selected/PVKH_DROP001_COLLECTOR_BOX_001_LAYER_REVEAL_FINAL_CONTENTS_CONCEPT_v04.png", "fe276110fc8ce203a286a5ddf139a8140544dee43acce1ca16ac3a3b744d8323"),
  mapping("MRCH-011", "collector-box-set", "detail", "production/physical-merch/concepts/drop-001/renders/archive-objects/collector-box-001/renders/selected/PVKH_DROP001_COLLECTOR_BOX_001_MATERIAL_DETAIL_CONCEPT_v02.png", "635c7af070f0c5d90ed30c6b16de9db80df2ddf18c0aa67771079f0785614a23")
];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
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

export const loadMerchAssetManifest = async () => JSON.parse(await readFile(manifestPath, "utf8"));

const verifyMappingContract = () => {
  if (SOURCE_MAPPINGS.length !== 50) throw new Error(`DROP 001 export requires exactly 50 mappings; received ${SOURCE_MAPPINGS.length}`);
  const signatures = new Set();
  for (const entry of SOURCE_MAPPINGS) {
    const signature = `${entry.objectId}/${entry.slug}/${entry.role}/${entry.publicPath}`;
    if (signatures.has(signature)) throw new Error(`duplicate merch export mapping ${signature}`);
    signatures.add(signature);
  }
};

const validateSource = async (entry) => {
  const sourceFile = path.join(repoRoot, entry.source);
  const actualSha = await fileSha256(sourceFile);
  if (actualSha !== entry.sourceSha256) throw new Error(`source hash mismatch: ${entry.source}`);
  return { sourceFile, sourceDimensions: await dimensions(sourceFile) };
};

const verifyManifestAssets = async (manifest) => {
  verifyMappingContract();
  if (manifest.assets.length !== SOURCE_MAPPINGS.length) throw new Error("merch asset manifest count mismatch");
  for (const [index, entry] of SOURCE_MAPPINGS.entries()) {
    const record = manifest.assets[index];
    for (const key of ["objectId", "slug", "role", "source", "sourceSha256", "publicPath"]) {
      if (record[key] !== entry[key]) throw new Error(`merch asset manifest mapping drift at ${entry.slug}/${entry.role}`);
    }
    const { sourceDimensions } = await validateSource(entry);
    if (record.sourceWidth !== sourceDimensions.width || record.sourceHeight !== sourceDimensions.height) {
      throw new Error(`source dimension drift: ${entry.source}`);
    }
    const publicFile = path.join(siteRoot, entry.publicPath);
    if (await fileSha256(publicFile) !== record.outputSha256) throw new Error(`public hash mismatch: ${entry.publicPath}`);
    const outputDimensions = await dimensions(publicFile);
    if (record.width !== outputDimensions.width || record.height !== outputDimensions.height) {
      throw new Error(`public dimension drift: ${entry.publicPath}`);
    }
  }
};

const exportOne = async (entry) => {
  const { sourceFile, sourceDimensions } = await validateSource(entry);
  const publicFile = path.join(siteRoot, entry.publicPath);
  const temporary = `${publicFile}.tmp-${process.pid}.webp`;
  await mkdir(path.dirname(publicFile), { recursive: true });
  await rm(temporary, { force: true });
  try {
    await execFile("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", sourceFile,
      "-vf", SCALE_FILTER,
      "-map_metadata", "-1", "-frames:v", "1", "-c:v", "libwebp", "-quality", "88",
      "-compression_level", "6", temporary
    ]);
    await rename(temporary, publicFile);
  } finally {
    await rm(temporary, { force: true });
  }
  const outputDimensions = await dimensions(publicFile);
  return {
    ...entry,
    sourceWidth: sourceDimensions.width,
    sourceHeight: sourceDimensions.height,
    outputSha256: await fileSha256(publicFile),
    width: outputDimensions.width,
    height: outputDimensions.height,
    encoder: ENCODER
  };
};

const approveLocalRoute = async (proofArgument) => {
  const proofPath = path.resolve(process.cwd(), proofArgument);
  const expectedPath = path.join(siteRoot, "dist", "links", "index.html");
  if (proofPath !== expectedPath) throw new Error("local route proof must be dist/links/index.html");
  const html = await readFile(proofPath, "utf8");
  if (!html.includes('<link rel="canonical" href="https://alessandropovkh.github.io/POVKH-LAB/links/"')) {
    throw new Error("local route proof has an invalid canonical");
  }
  if (!html.includes("/POVKH-LAB/")) throw new Error("local route proof is missing the production base path");
  const manifest = await loadMerchAssetManifest();
  manifest.imports.signalKitV06.state = "approvedForPublicConceptArchivePendingReachability";
  manifest.imports.signalKitV06.localProductionRoutePassed = true;
  manifest.imports.signalKitV06.localCanonicalPassed = true;
  const temporary = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, manifestPath);
};

const approveLiveRoute = async () => {
  const targetUrl = "https://alessandropovkh.github.io/POVKH-LAB/links/";
  const response = await fetch(targetUrl, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000)
  });
  if (response.status !== 200) throw new Error(`live route returned HTTP ${response.status}`);
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
    throw new Error("live route did not return HTML");
  }
  const html = await response.text();
  if (!html.includes(`<link rel="canonical" href="${targetUrl}"`)) throw new Error("live route canonical mismatch");
  if (!html.includes("data-social-access-nav") || !html.includes("https://www.instagram.com/povkh_lab/")) {
    throw new Error("live route is missing the approved social-access contract");
  }
  const manifest = await loadMerchAssetManifest();
  if (manifest.imports.signalKitV06.localProductionRoutePassed !== true
    || manifest.imports.signalKitV06.localCanonicalPassed !== true) {
    throw new Error("live route cannot be approved before local production proof");
  }
  manifest.imports.signalKitV06.state = "approvedForPublicConceptArchive";
  manifest.imports.signalKitV06.liveReachability = "passed";
  const temporary = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, manifestPath);
};

export const exportMerchAssets = async ({ verifyOnly = false } = {}) => {
  verifyMappingContract();
  if (verifyOnly) {
    await verifyManifestAssets(await loadMerchAssetManifest());
    return;
  }
  let existingImport = null;
  try {
    existingImport = (await loadMerchAssetManifest()).imports.signalKitV06;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const assets = [];
  for (const entry of SOURCE_MAPPINGS) assets.push(await exportOne(entry));
  const manifest = {
    schemaVersion: 1,
    status: "approvedConceptExports",
    imports: {
      signalKitV06: existingImport || {
        state: "preparedForPublicConceptArchive",
        designSpec: "docs/superpowers/specs/2026-08-05-povkh-signal-kit-production-qr-gallery-design.md",
        implementationPlan: "docs/superpowers/plans/2026-08-05-povkh-signal-kit-production-qr-gallery.md",
        targetUrl: "https://alessandropovkh.github.io/POVKH-LAB/links/",
        authoritativeQaPassed: true,
        authoritativeDecodePassed: true,
        localProductionRoutePassed: false,
        localCanonicalPassed: false,
        liveReachability: "pendingPostDeploy",
        privateGovernanceUnchanged: true
      }
    },
    assets
  };
  const temporary = `${manifestPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, manifestPath);
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === "--approve-local-route") {
    if (args.length !== 2) throw new Error("--approve-local-route requires one proof path");
    await approveLocalRoute(args[1]);
  } else if (args.length === 1 && args[0] === "--approve-live-route") {
    await approveLiveRoute();
  } else if (args.length === 0) {
    await exportMerchAssets();
  } else if (args.length === 1 && args[0] === "--verify") {
    await exportMerchAssets({ verifyOnly: true });
  } else {
    throw new Error(`unsupported merch asset arguments: ${args.join(" ")}`);
  }
}

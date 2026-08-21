export const EXPECTED_SHEET_COUNT = 12;

export const LOGO_MASTERS = [
  { path: "assets/logo/povkh-lab-primary-dark-outlined.svg", width: 1000, height: 1000, transparent: false },
  { path: "assets/logo/povkh-lab-primary-light-outlined.svg", width: 1000, height: 1000, transparent: false },
  { path: "assets/logo/povkh-lab-mono-dark-outlined.svg", width: 1000, height: 1000, transparent: false },
  { path: "assets/logo/povkh-lab-mono-light-outlined.svg", width: 1000, height: 1000, transparent: false },
  { path: "assets/logo/povkh-lab-horizontal-dark-outlined.svg", width: 1600, height: 400, transparent: false },
  { path: "assets/logo/povkh-lab-compact-dark-outlined.svg", width: 1000, height: 1000, transparent: false },
  { path: "assets/logo/povkh-lab-compact-light-outlined.svg", width: 1000, height: 1000, transparent: false },
  { path: "assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg", width: 1000, height: 1000, transparent: true },
  { path: "assets/logo/povkh-lab-primary-dark-transparent-outlined.svg", width: 1000, height: 1000, transparent: true },
  { path: "assets/logo/povkh-lab-mono-white-transparent-outlined.svg", width: 1000, height: 1000, transparent: true },
  { path: "assets/logo/povkh-lab-mono-black-transparent-outlined.svg", width: 1000, height: 1000, transparent: true },
  { path: "assets/logo/povkh-lab-horizontal-reverse-transparent-outlined.svg", width: 1600, height: 400, transparent: true },
  { path: "assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg", width: 1000, height: 1000, transparent: true },
  { path: "assets/logo/povkh-lab-ascii-dark-outlined.svg", width: 1600, height: 600, transparent: false },
  { path: "assets/logo/povkh-lab-ascii-reverse-transparent-outlined.svg", width: 1600, height: 600, transparent: true },
];

export const TEMPLATE_SPECS = [
  {
    path: "templates/release-cover-type.svg",
    width: 3000,
    height: 3000,
    viewBoxWidth: 1000,
    viewBoxHeight: 1000,
    safe: { x: 60, y: 60, width: 880, height: 880 },
    safeAttribute: "data-safe-inset",
    safeValue: "60",
    criticalCount: 5,
  },
  {
    path: "templates/instagram-announce-4x5.svg",
    width: 1080,
    height: 1350,
    viewBoxWidth: 1080,
    viewBoxHeight: 1350,
    safe: { x: 72, y: 72, width: 936, height: 1206 },
    safeAttribute: "data-safe-inset",
    safeValue: "72",
    criticalCount: 5,
  },
  {
    path: "templates/story-signal-9x16.svg",
    width: 1080,
    height: 1920,
    viewBoxWidth: 1080,
    viewBoxHeight: 1920,
    safe: { x: 120, y: 250, width: 720, height: 1350 },
    safeAttribute: "data-safe-zone",
    safeValue: "120 250 720 1350",
    criticalCount: 4,
  },
  {
    path: "templates/youtube-thumbnail-16x9.svg",
    width: 1280,
    height: 720,
    viewBoxWidth: 1280,
    viewBoxHeight: 720,
    safe: { x: 64, y: 64, width: 1152, height: 592 },
    safeAttribute: "data-safe-inset",
    safeValue: "64",
    criticalCount: 5,
  },
];

export const RASTER_EXPORTS = [
  {
    source: "assets/logo/povkh-lab-primary-dark-outlined.svg",
    output: "POVKHLAB_Logo_Stacked_Dark_2000.png",
    width: 2000,
    height: 2000,
    transparent: false,
  },
  {
    source: "assets/logo/povkh-lab-primary-light-outlined.svg",
    output: "POVKHLAB_Logo_Stacked_Light_2000.png",
    width: 2000,
    height: 2000,
    transparent: false,
  },
  {
    source: "assets/logo/povkh-lab-compact-dark-outlined.svg",
    output: "POVKHLAB_Mark_PL_Dark_1500.png",
    width: 1500,
    height: 1500,
    transparent: false,
  },
  {
    source: "assets/logo/povkh-lab-horizontal-dark-outlined.svg",
    output: "POVKHLAB_Logo_Horizontal_Dark_3200x800.png",
    width: 3200,
    height: 800,
    transparent: false,
  },
  {
    source: "assets/logo/povkh-lab-primary-reverse-transparent-outlined.svg",
    output: "POVKHLAB_Logo_Stacked_Reverse_Transparent_2000.png",
    width: 2000,
    height: 2000,
    transparent: true,
  },
  {
    source: "assets/logo/povkh-lab-mono-black-transparent-outlined.svg",
    output: "POVKHLAB_Logo_Stacked_MonoBlack_Transparent_2000.png",
    width: 2000,
    height: 2000,
    transparent: true,
  },
  {
    source: "assets/logo/povkh-lab-compact-reverse-transparent-outlined.svg",
    output: "POVKHLAB_Mark_PL_Reverse_Transparent_1500.png",
    width: 1500,
    height: 1500,
    transparent: true,
  },
  {
    source: "assets/logo/povkh-lab-ascii-dark-outlined.svg",
    output: "POVKHLAB_ASCII_Signature_Dark_3200x1200.png",
    width: 3200,
    height: 1200,
    transparent: false,
  },
  {
    source: "templates/release-cover-type.svg",
    output: "POVKHLAB_Template_Release_TYPE_3000.png",
    width: 3000,
    height: 3000,
    transparent: false,
  },
  {
    source: "templates/instagram-announce-4x5.svg",
    output: "POVKHLAB_Template_Instagram_4x5_1080x1350.png",
    width: 1080,
    height: 1350,
    transparent: false,
  },
  {
    source: "templates/story-signal-9x16.svg",
    output: "POVKHLAB_Template_Story_9x16_1080x1920.png",
    width: 1080,
    height: 1920,
    transparent: false,
  },
  {
    source: "templates/youtube-thumbnail-16x9.svg",
    output: "POVKHLAB_Template_YouTube_1280x720.png",
    width: 1280,
    height: 720,
    transparent: false,
  },
];

export const BOARD_PDF = "POVKH-LAB-Brand-Board-v1.0.pdf";
export const BOARD_PNG = "POVKH-LAB-Brand-Board-v1.0.png";
export const MANIFEST_FILE = "export-manifest.json";

export function boardPageName(index) {
  return `POVKH-LAB-Board-${String(index).padStart(2, "0")}.png`;
}

export function stableManifest(sourceSha256) {
  return {
    schemaVersion: 2,
    sourceSha256,
    boardSheets: EXPECTED_SHEET_COUNT,
    board: {
      pdf: BOARD_PDF,
      overview: BOARD_PNG,
      pageDirectory: "board-pages",
      pageWidth: 1600,
      pageHeight: 1000,
    },
    rasters: RASTER_EXPORTS.map(({ output, width, height, transparent }) => ({
      output,
      width,
      height,
      transparent,
    })),
  };
}

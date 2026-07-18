import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticServer } from "./server.mjs";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number.parseInt(process.env.PORT || "4173", 10);
const app = createStaticServer({ root: path.join(siteRoot, "dist"), port, cacheControl: "no-store" });
const url = await app.listen();

console.log(`POVKH LAB site: ${url}`);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

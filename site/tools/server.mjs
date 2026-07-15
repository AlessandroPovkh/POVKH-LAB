import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

const safeStat = async (file) => {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const securityHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

export const createStaticServer = ({ root, host = "127.0.0.1", port = 0 } = {}) => {
  const absoluteRoot = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://local.test");
      let pathname;
      try {
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        response.writeHead(400, securityHeaders).end("Bad request");
        return;
      }

      let relative = pathname.replace(/^\/+/, "");
      let candidate = path.resolve(absoluteRoot, relative);
      if (candidate !== absoluteRoot && !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
        response.writeHead(403, securityHeaders).end("Forbidden");
        return;
      }

      let info = await safeStat(candidate);
      if (info?.isDirectory()) {
        if (!pathname.endsWith("/")) {
          response.writeHead(308, { ...securityHeaders, Location: `${pathname}/${requestUrl.search}` }).end();
          return;
        }
        candidate = path.join(candidate, "index.html");
        info = await safeStat(candidate);
      } else if (!info && !path.extname(candidate)) {
        const asDirectory = path.join(candidate, "index.html");
        const directoryIndex = await safeStat(asDirectory);
        if (directoryIndex?.isFile()) {
          response.writeHead(308, { ...securityHeaders, Location: `${pathname}/${requestUrl.search}` }).end();
          return;
        }
      }

      let status = 200;
      if (!info?.isFile()) {
        const localeSegment = pathname.split("/").filter(Boolean)[0];
        const localized404 = localeSegment === "it" || localeSegment === "ru"
          ? path.join(localeSegment, "404.html")
          : "404.html";
        candidate = path.join(absoluteRoot, localized404);
        info = await safeStat(candidate);
        status = 404;
      }

      if (!info?.isFile()) {
        response.writeHead(404, securityHeaders).end("Not found");
        return;
      }

      const extension = path.extname(candidate).toLowerCase();
      const headers = {
        ...securityHeaders,
        "Content-Type": MIME.get(extension) || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
      };
      response.writeHead(status, headers);
      if (request.method === "HEAD") response.end();
      else createReadStream(candidate).pipe(response);
    } catch (error) {
      response.writeHead(500, securityHeaders).end("Internal server error");
      console.error(error);
    }
  });

  return {
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      const address = server.address();
      return `http://${host}:${address.port}`;
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
};

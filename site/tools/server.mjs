import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".pdf", "application/pdf"],
  [".mp4", "video/mp4"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain; charset=utf-8"],
  [".webm", "video/webm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"]
]);

const safeStat = async (file) => {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
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

export const createStaticServer = ({ root, host = "127.0.0.1", port = 0, cacheControl = null, basePath = "" } = {}) => {
  const absoluteRoot = path.resolve(root);
  const normalizedBasePath = basePath && basePath !== "/" ? `/${basePath.replace(/^\/+|\/+$/g, "")}` : "";
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { ...securityHeaders, Allow: "GET, HEAD" }).end("Method not allowed");
        return;
      }
      const requestUrl = new URL(request.url, "http://local.test");
      let pathname;
      try {
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        response.writeHead(400, securityHeaders).end("Bad request");
        return;
      }
      if (pathname.includes("\0")) {
        response.writeHead(400, securityHeaders).end("Bad request");
        return;
      }

      const publicPathname = pathname;
      if (normalizedBasePath && (pathname === normalizedBasePath || pathname.startsWith(`${normalizedBasePath}/`))) {
        pathname = pathname.slice(normalizedBasePath.length) || "/";
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
          response.writeHead(308, { ...securityHeaders, Location: `${publicPathname}/${requestUrl.search}` }).end();
          return;
        }
        candidate = path.join(candidate, "index.html");
        info = await safeStat(candidate);
      } else if (!info && !path.extname(candidate)) {
        const asDirectory = path.join(candidate, "index.html");
        const directoryIndex = await safeStat(asDirectory);
        if (directoryIndex?.isFile()) {
          response.writeHead(308, { ...securityHeaders, Location: `${publicPathname}/${requestUrl.search}` }).end();
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
      let responseStatus = status;
      let rangeStart = 0;
      let rangeEnd = Math.max(0, info.size - 1);
      const rangeHeader = status === 200 ? request.headers.range : null;

      if (rangeHeader && /^bytes=(\d*)-(\d*)$/.test(rangeHeader)) {
        const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
        let valid = Boolean(match) && Boolean(match?.[1] || match?.[2]) && info.size > 0;
        if (valid && !match[1]) {
          const suffixLength = Number(match[2]);
          valid = Number.isSafeInteger(suffixLength) && suffixLength > 0;
          if (valid) rangeStart = Math.max(0, info.size - suffixLength);
        } else if (valid) {
          rangeStart = Number(match[1]);
          rangeEnd = match[2] ? Number(match[2]) : info.size - 1;
          valid = Number.isSafeInteger(rangeStart)
            && Number.isSafeInteger(rangeEnd)
            && rangeStart >= 0
            && rangeStart < info.size
            && rangeEnd >= rangeStart;
        }
        rangeEnd = Math.min(rangeEnd, info.size - 1);
        if (!valid) {
          response.writeHead(416, {
            ...securityHeaders,
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${info.size}`,
            "Content-Length": 0
          }).end();
          return;
        }
        responseStatus = 206;
      }

      const contentLength = responseStatus === 206 ? rangeEnd - rangeStart + 1 : info.size;
      const headers = {
        ...securityHeaders,
        "Content-Type": MIME.get(extension) || "application/octet-stream",
        "Content-Length": contentLength,
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl || (extension === ".html" ? "no-cache" : "public, max-age=3600")
      };
      if (responseStatus === 206) headers["Content-Range"] = `bytes ${rangeStart}-${rangeEnd}/${info.size}`;
      response.writeHead(responseStatus, headers);
      if (request.method === "HEAD") response.end();
      else createReadStream(candidate, responseStatus === 206 ? { start: rangeStart, end: rangeEnd } : undefined).pipe(response);
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

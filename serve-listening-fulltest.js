const http = require("http");
const fs = require("fs");
const path = require("path");

const root = "D:\\mock";
const port = 30013;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function safePath(urlPath) {
  let pathname = decodeURIComponent(urlPath);
  if (pathname === "/") pathname = "/02.09.2025_full_test.html";

  const target = path.resolve(root, `.${pathname.replace(/\//g, path.sep)}`);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  const lowerTarget = target.toLowerCase();
  const lowerRoot = root.toLowerCase();
  const lowerRootWithSep = rootWithSep.toLowerCase();

  if (lowerTarget !== lowerRoot && !lowerTarget.startsWith(lowerRootWithSep)) {
    return null;
  }

  return target;
}

function sendFile(req, res, target, stat) {
  const type = types[path.extname(target).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number.parseInt(match[1], 10) : 0;
    const end = match && match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(target, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(target).pipe(res);
}

http
  .createServer((req, res) => {
    try {
      const target = safePath(new URL(req.url, "http://127.0.0.1").pathname);

      if (!target) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.stat(target, (error, stat) => {
        if (error || !stat.isFile()) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        sendFile(req, res, target, stat);
      });
    } catch (error) {
      res.writeHead(500);
      res.end(error && error.message ? error.message : String(error));
    }
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Listening full test server on http://127.0.0.1:${port}/`);
  });

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.argv[2] || 8000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mp3": "audio/mpeg"
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(root, relative);

  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(file, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }

    const type = types[path.extname(file).toLowerCase()] || "application/octet-stream";
    const range = request.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : stats.size - 1;
      response.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes"
      });
      fs.createReadStream(file, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, {
      "Content-Type": type,
      "Content-Length": stats.size,
      "Accept-Ranges": "bytes"
    });
    fs.createReadStream(file).pipe(response);
  });
}).listen(port, "127.0.0.1");

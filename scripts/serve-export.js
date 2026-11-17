const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const directory = path.resolve(__dirname, "..", "out");
const portIndex = process.argv.indexOf("--port");
const port = Number(portIndex < 0 ? 3140 : process.argv[portIndex + 1]);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const server = http.createServer((request, response) => {
  let filename;
  try {
    filename = path.resolve(
      directory,
      `.${decodeURIComponent(new URL(request.url, "http://localhost").pathname)}`,
    );
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (
    filename !== directory &&
    !filename.startsWith(`${directory}${path.sep}`)
  ) {
    response.writeHead(403).end();
    return;
  }
  if (fs.existsSync(filename) && fs.statSync(filename).isDirectory())
    filename = path.join(filename, "index.html");
  if (!fs.existsSync(filename)) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": types[path.extname(filename)] ?? "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Static FinanceIQ export listening on ${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));

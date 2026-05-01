import { createReadStream, existsSync, readFileSync, statSync, type Stats } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "pathe";
import { defineCommand } from "citty";

/**
 * `modular-react-catalog serve [dir]` — minimal zero-dep static server for a
 * built catalog. Uses node:http directly so the package keeps its tiny
 * dependency footprint and so the command can be a one-liner npm script
 * without any extra install.
 *
 * Falls back to `index.html` for any path that doesn't resolve to a file —
 * required because the SPA uses TanStack Router's BrowserHistory when served
 * over http (see `spa-src/src/router.tsx`). Without the fallback, deep links
 * like `/modules/billing` would 404.
 */
export const serveCommand = defineCommand({
  meta: {
    name: "serve",
    description: "Host a built catalog directory over HTTP for local viewing or e2e tests.",
  },
  args: {
    dir: {
      type: "positional",
      required: false,
      description: "Catalog output directory (defaults to dist-catalog).",
    },
    port: {
      type: "string",
      description: "Port to listen on (default 4321). Pass 0 to bind a random free port.",
    },
    host: {
      type: "string",
      description: "Host interface to bind (default 127.0.0.1).",
    },
  },
  async run({ args }) {
    const dir = resolve(process.cwd(), args.dir ?? "dist-catalog");
    if (!existsSync(dir)) {
      console.error(`[catalog] Directory not found: ${dir}`);
      console.error(`[catalog] Run \`modular-react-catalog build\` first.`);
      process.exit(1);
    }
    if (!existsSync(join(dir, "index.html"))) {
      console.error(`[catalog] No index.html in ${dir}. Is this a catalog output directory?`);
      process.exit(1);
    }

    const port = args.port !== undefined ? Number(args.port) : 4321;
    if (!Number.isFinite(port) || port < 0 || port > 65535) {
      console.error(`[catalog] Invalid --port value: ${args.port}`);
      process.exit(1);
    }
    const host = args.host ?? "127.0.0.1";

    const { server, port: actualPort } = await startServer({ root: dir, port, host });
    console.log(`[catalog] Serving ${dir}`);
    console.log(`[catalog] http://${host}:${actualPort}`);

    const shutdown = () => server.close(() => process.exit(0));
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  },
});

export interface StartServerOptions {
  readonly root: string;
  readonly port?: number;
  readonly host?: string;
}

export interface StartedServer {
  readonly server: Server;
  readonly port: number;
}

/**
 * Boot the static server programmatically. Returns once the server is
 * listening, with the actual bound port (useful when port `0` was requested).
 * Exposed for the e2e test harness — production callers should prefer the
 * CLI command, which adds argument validation and signal handling.
 */
export async function startServer(options: StartServerOptions): Promise<StartedServer> {
  const root = resolve(options.root);
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";

  const server = createServer((req, res) => handleRequest(req, res, root));

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => resolvePromise());
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  return { server, port: actualPort };
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function handleRequest(req: IncomingMessage, res: ServerResponse, root: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD");
    res.end("Method Not Allowed");
    return;
  }

  const url = req.url ?? "/";
  const pathname = url.split("?")[0]!.split("#")[0]!;
  const decoded = safeDecode(pathname);
  if (decoded === null) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  // Guard against path traversal: resolve, then verify the result is still
  // inside `root`. `normalize` collapses `..` segments before the join.
  const requested = normalize(decoded.replace(/^\/+/, ""));
  const filePath = resolve(root, requested);
  if (filePath !== root && !filePath.startsWith(root + "/") && !filePath.startsWith(root + "\\")) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  const target = resolveStaticFile(filePath, root);
  if (!target) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  const stat = safeStat(target);
  if (!stat) {
    sendError(res, 404, "Not Found");
    return;
  }
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    MIME_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
  );
  if (
    target.endsWith("index.html") ||
    target.endsWith("catalog.json") ||
    target.endsWith("manifest.json")
  ) {
    res.setHeader("Cache-Control", "no-cache");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }

  // The SPA build uses Vite's `base: "./"` so users can also open the
  // bundle as `file://…/index.html`. That's broken for deep-link fallbacks
  // here: a request for `/modules/billing` returns the index.html shell,
  // and the browser then resolves `./assets/foo.js` against the deep URL —
  // landing on `/modules/assets/foo.js`, which 404s. Inject `<base href="/">`
  // so all relative URLs in the shell resolve from the root, regardless of
  // which deep path triggered the fallback.
  if (target.endsWith("index.html")) {
    let html: string;
    try {
      html = readFileSync(target, "utf8");
    } catch (err) {
      console.error(`[catalog] Failed to read ${target}:`, err);
      sendError(res, 500, "Internal Server Error");
      return;
    }
    const rewritten = html.includes("<base ")
      ? html
      : html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}<base href="/">`);
    const body = Buffer.from(rewritten, "utf8");
    res.setHeader("Content-Length", body.byteLength);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
    return;
  }

  res.setHeader("Content-Length", stat.size);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(target);
  stream.on("error", (err) => {
    console.error(`[catalog] Failed to stream ${target}:`, err);
    if (!res.headersSent) {
      sendError(res, 500, "Internal Server Error");
    } else {
      res.destroy(err);
    }
  });
  stream.pipe(res);
}

/**
 * Returns the path to serve for a given request, or `null` for 404.
 * Order: exact file → directory's index.html → SPA fallback to root index.html.
 */
function resolveStaticFile(filePath: string, root: string): string | null {
  if (safeStat(filePath)?.isFile()) {
    return filePath;
  }
  const indexInDir = join(filePath, "index.html");
  if (safeStat(indexInDir)?.isFile()) {
    return indexInDir;
  }
  // SPA fallback only for non-asset paths — don't paper over a missing /assets/foo.js.
  if (extname(filePath) === "" || extname(filePath) === ".html") {
    const rootIndex = join(root, "index.html");
    if (existsSync(rootIndex)) return rootIndex;
  }
  return null;
}

function safeStat(path: string): Stats | null {
  try {
    return statSync(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      console.error(`[catalog] Failed to stat ${path}:`, err);
    }
    return null;
  }
}

function sendError(res: ServerResponse, statusCode: number, message: string): void {
  res.statusCode = statusCode;
  res.end(message);
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

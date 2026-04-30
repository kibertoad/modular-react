import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type StartedServer } from "./serve-command.js";

function rawHttpGet(port: number, path: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = connect({ host: "127.0.0.1", port });
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => resolvePromise(data));
    socket.on("error", rejectPromise);
    socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
  });
}

describe("startServer", () => {
  let dir: string;
  let started: StartedServer;
  let baseUrl: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "catalog-serve-"));
    writeFileSync(
      join(dir, "index.html"),
      '<!doctype html><html><head><script src="./assets/app.js"></script></head><body>app</body></html>',
    );
    writeFileSync(join(dir, "catalog.json"), JSON.stringify({ schemaVersion: "1" }));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "app.js"), "console.log('app')");
    started = await startServer({ root: dir, port: 0 });
    baseUrl = `http://127.0.0.1:${started.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => started.server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves index.html at /", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<body>app</body>");
  });

  it("serves a file by path", async () => {
    const res = await fetch(`${baseUrl}/catalog.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ schemaVersion: "1" });
  });

  it("serves nested asset files", async () => {
    const res = await fetch(`${baseUrl}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  it("falls back to index.html for unknown SPA-style routes", async () => {
    const res = await fetch(`${baseUrl}/modules/billing`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<body>app</body>");
  });

  it('injects <base href="/"> into index.html so deep-link fallbacks resolve assets correctly', async () => {
    const res = await fetch(`${baseUrl}/modules/billing`);
    const body = await res.text();
    expect(body).toContain('<base href="/">');
  });

  it("does not fall back for missing asset paths", async () => {
    const res = await fetch(`${baseUrl}/assets/nope.js`);
    expect(res.status).toBe(404);
  });

  it("rejects path traversal attempts via raw HTTP request", async () => {
    // Node's `fetch` and the WHATWG URL parser both normalize `..` segments
    // client-side, so we send the request with a raw socket to make sure the
    // server itself sees the traversal. The handler must NOT serve a file
    // outside `root`, regardless of how index.html fallback is triggered.
    const sentinel = "outside-root-" + Math.random().toString(36).slice(2);
    writeFileSync(join(dir, "..", `${sentinel}.txt`), "secret");
    try {
      const body = await rawHttpGet(started.port, `/../${sentinel}.txt`);
      expect(body).not.toContain("secret");
    } finally {
      rmSync(join(dir, "..", `${sentinel}.txt`), { force: true });
    }
  });

  it("returns 405 for unsupported methods", async () => {
    const res = await fetch(`${baseUrl}/`, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, HEAD");
  });

  it("supports HEAD requests", async () => {
    const res = await fetch(`${baseUrl}/catalog.json`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).not.toBeNull();
    expect(await res.text()).toBe("");
  });

  it("ignores query strings when resolving files", async () => {
    const res = await fetch(`${baseUrl}/catalog.json?v=123`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ schemaVersion: "1" });
  });
});

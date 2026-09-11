// Publishes the built site (dist/) to a bunny.net Storage Zone.
//
//   node scripts/deploy-bunny.ts            upload, remove stale files, purge the CDN
//   node scripts/deploy-bunny.ts --dry-run  only show what would change
//
// Environment:
//   BUNNY_STORAGE_ZONE       storage zone name, e.g. lunchpad-docs          (required)
//   BUNNY_STORAGE_PASSWORD   the zone's password (FTP & API access)         (required)
//   BUNNY_STORAGE_HOST       regional endpoint, default storage.bunnycdn.com
//   BUNNY_API_KEY            account API key       } both set: the pull zone's
//   BUNNY_PULLZONE_ID        pull zone id          } cache is purged afterwards
//
// Every file is uploaded before anything is deleted, so visitors never hit a
// missing asset mid-deploy. The 404 page is also placed where Bunny looks for
// a custom error page (bunnycdn_errors/404.html).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = resolve(fileURLToPath(new URL("..", import.meta.url)), "dist");
const ERROR_PAGE = "bunnycdn_errors/404.html";
const CONCURRENCY = 8;
const dryRun = process.argv.includes("--dry-run");

const env = (name: string, fallback?: string) => {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
};

const zone = env("BUNNY_STORAGE_ZONE");
const password = env("BUNNY_STORAGE_PASSWORD");
const host = env("BUNNY_STORAGE_HOST", "storage.bunnycdn.com");
const apiKey = process.env.BUNNY_API_KEY?.trim();
const pullZone = process.env.BUNNY_PULLZONE_ID?.trim();

const url = (path: string) => `https://${host}/${zone}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function request(method: string, path: string, body?: Buffer, headers: Record<string, string> = {}): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url(path), { method, body, headers: { AccessKey: password, ...headers } }).catch((e: Error) => e);
    if (!(res instanceof Error) && (res.ok || res.status === 404 || res.status < 500)) return res;
    if (attempt === 3) throw new Error(`${method} /${path}: ${res instanceof Error ? res.message : `HTTP ${res.status}`}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
}

/** Every file of the build, by its path in the zone. */
function localFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(DIST, full).split(sep).join("/"), full);
    }
  };
  walk(DIST);
  if (files.has("404.html")) files.set(ERROR_PAGE, files.get("404.html")!);
  return files;
}

/** Every file and directory in the zone, by path ("dir/" for directories). */
async function remoteObjects(dir = ""): Promise<{ files: string[]; dirs: string[] }> {
  const res = await request("GET", dir);
  if (res.status === 404) return { files: [], dirs: [] };
  if (!res.ok) throw new Error(`listing /${dir}: HTTP ${res.status} ${await res.text()}`);
  const entries = (await res.json()) as { ObjectName: string; IsDirectory: boolean }[];
  const out = { files: [] as string[], dirs: [] as string[] };
  for (const entry of entries) {
    const path = `${dir}${entry.ObjectName}`;
    if (entry.IsDirectory) {
      out.dirs.push(`${path}/`);
      const inner = await remoteObjects(`${path}/`);
      out.files.push(...inner.files);
      out.dirs.push(...inner.dirs);
    } else out.files.push(path);
  }
  return out;
}

async function inParallel<T>(items: T[], work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
  }));
}

const local = localFiles();
if (!local.has("index.html")) {
  console.error(`No build in ${DIST}. Run "npm run build" first.`);
  process.exit(1);
}
const remote = await remoteObjects();

// Stale: remote files the build no longer has. A directory that is gone as a
// whole goes in one (recursive) delete; files go one by one.
const keepDirs = new Set([...local.keys()].flatMap((p) => p.split("/").slice(0, -1).map((_, i, parts) => `${parts.slice(0, i + 1).join("/")}/`)));
const staleDirs = remote.dirs.filter((d) => !keepDirs.has(d) && !remote.dirs.some((o) => o !== d && d.startsWith(o) && !keepDirs.has(o)));
const staleFiles = remote.files.filter((f) => !local.has(f) && !staleDirs.some((d) => f.startsWith(d)));

console.log(`${zone}: ${local.size} files to upload, ${staleFiles.length} stale files and ${staleDirs.length} stale folders to remove.`);
if (dryRun) {
  [...staleDirs, ...staleFiles].forEach((p) => console.log(`  - ${p}`));
  process.exit(0);
}

let uploaded = 0;
await inParallel([...local], async ([path, full]) => {
  const body = readFileSync(full);
  const checksum = createHash("sha256").update(body).digest("hex").toUpperCase();
  const res = await request("PUT", path, body, { "Content-Type": "application/octet-stream", Checksum: checksum });
  if (res.status !== 201) throw new Error(`upload /${path}: HTTP ${res.status} ${await res.text()}`);
  if (++uploaded % 50 === 0) console.log(`  ${uploaded} / ${local.size}`);
});
console.log(`uploaded ${uploaded} files`);

await inParallel([...staleDirs, ...staleFiles], async (path) => {
  const res = await request("DELETE", path);
  if (!res.ok && res.status !== 404) throw new Error(`delete /${path}: HTTP ${res.status} ${await res.text()}`);
  console.log(`  removed /${path}`);
});

if (apiKey && pullZone) {
  const res = await fetch(`https://api.bunny.net/pullzone/${encodeURIComponent(pullZone)}/purgeCache`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`purging pull zone ${pullZone}: HTTP ${res.status} ${await res.text()}`);
  console.log(`purged the cache of pull zone ${pullZone}`);
} else {
  console.log("BUNNY_API_KEY / BUNNY_PULLZONE_ID not set: the CDN cache was not purged; cached pages update when they expire.");
}

// Serves the real Lunchpad interface (../lunchpad/src) in a normal browser,
// with the Tauri modules swapped for the fake backend in ./mock.
//
//   node scripts/screenshots/serve.ts        → open the printed URL to look around
//
// Nothing is written into the Lunchpad checkout: Vite, React and Tailwind are
// loaded from its node_modules, the Vite cache lives in this project.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOCK = join(HERE, "mock");
export const DOCS = resolve(HERE, "../..");
/** The Lunchpad app checkout; override with LUNCHPAD_DIR. */
export const LUNCHPAD = resolve(process.env.LUNCHPAD_DIR ?? join(DOCS, "../../lunchpad"));

/** ESM entry of a package, the way `import` would pick it. */
function esmEntry(pkg: { exports?: unknown; module?: string; main?: string }): string {
  let entry: unknown = (pkg.exports as Record<string, unknown> | undefined)?.["."] ?? pkg.exports ?? pkg.module ?? pkg.main;
  while (entry && typeof entry === "object") {
    const conditions = entry as Record<string, unknown>;
    entry = conditions.import ?? conditions.default ?? conditions.node;
  }
  return typeof entry === "string" ? entry : "index.js";
}

/** Import a package from the app's node_modules, so the interface builds with its own versions. */
async function fromApp(name: string) {
  const dir = join(LUNCHPAD, "node_modules", name);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return import(pathToFileURL(join(dir, esmEntry(pkg))).href);
}

export async function startServer(port = 1430): Promise<{ url: string; close: () => Promise<void> }> {
  const vite = await fromApp("vite");
  const react = (await fromApp("@vitejs/plugin-react")).default;
  const tailwind = (await fromApp("@tailwindcss/vite")).default;
  const version = JSON.parse(readFileSync(join(LUNCHPAD, "package.json"), "utf8")).version;
  const plugins = join(MOCK, "plugins.ts");

  const server = await vite.createServer({
    root: LUNCHPAD,
    configFile: false,
    cacheDir: join(DOCS, "node_modules/.vite-lunchpad"),
    logLevel: "warn",
    clearScreen: false,
    plugins: [react(), tailwind()],
    define: { __LUNCHPAD_VERSION__: JSON.stringify(version) },
    resolve: {
      alias: [
        { find: /^@tauri-apps\/api\/core$/, replacement: join(MOCK, "tauri-core.ts") },
        { find: /^@tauri-apps\/api\/event$/, replacement: join(MOCK, "tauri-event.ts") },
        { find: /^@tauri-apps\/(api\/app|plugin-dialog|plugin-opener|plugin-process|plugin-updater)$/, replacement: plugins },
        { find: /^@app\//, replacement: join(LUNCHPAD, "src") + "/" },
      ],
    },
    server: { port, strictPort: true, fs: { allow: [LUNCHPAD, HERE] } },
  });
  await server.listen();
  return { url: `http://localhost:${port}/`, close: () => server.close() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer(Number(process.env.PORT ?? 1430));
  console.log(`Lunchpad interface with demo data: ${url}`);
}

// Keeps the action reference in step with the app.
//
//   node scripts/actions.ts          sync src/data/actions.json from ../lunchpad, then check
//   node scripts/actions.ts --check  only check (no Lunchpad checkout needed)
//
// Sync reads the app's own sources: the action list (src/lib/api.ts), the
// "Add action" menu (ActionsTab.tsx), icons (actionUtils.ts, icons/icons.ts)
// and the English names (i18n/en.json). The check fails when an action the app
// ships has no docs page or no screenshot.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LUNCHPAD = resolve(process.env.LUNCHPAD_DIR ?? join(DOCS, "../../lunchpad"));
const DATA = join(DOCS, "src/data/actions.json");
const PAGES = join(DOCS, "src/content/docs/actions");
const SHOTS = join(DOCS, "src/assets/screenshots/actions");

interface ActionInfo {
  name: string;
  desc: string;
  group: string;
  icon: string;
  /** false for the markers that come with a menu entry (Otherwise, End condition, …) */
  menu: boolean;
  /** the action row has a Wait switch */
  wait: boolean;
  /** the menu entry a marker belongs to */
  partOf?: string;
}
interface ActionData {
  groups: { id: string; name: string; icon: string; types: string[] }[];
  actions: Record<string, ActionInfo>;
  icons: Record<string, { viewBox: string; body: string }>;
}

const read = (path: string) => readFileSync(join(LUNCHPAD, path), "utf8");
const strings = (list: string) => [...list.matchAll(/"(\w+)"/g)].map((m) => m[1]);

function sync(): ActionData {
  const api = read("src/lib/api.ts");
  const available = strings(/AVAILABLE_ACTIONS[^[]*\[([\s\S]*?)\]\s*\)/.exec(api)![1]);

  const tab = read("src/components/actions/ActionsTab.tsx");
  const menuBlock = /MENU_GROUPS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(tab)![1];
  const menu = [...menuBlock.matchAll(/group:\s*"(\w+)",\s*types:\s*\[([^\]]*)\]/g)].map((m) => ({ id: m[1], types: strings(m[2]) }));

  const utils = read("src/components/actions/actionUtils.ts");
  const iconOf = Object.fromEntries([.../ACTION_ICONS[^{]*\{([\s\S]*?)\n\};/.exec(utils)![1].matchAll(/(\w+):\s*"(\w+)"/g)].map((m) => [m[1], m[2]]));
  const groupIcon = Object.fromEntries([.../GROUP_ICONS[^{]*\{([\s\S]*?)\n\};/.exec(utils)![1].matchAll(/(\w+):\s*"(\w+)"/g)].map((m) => [m[1], m[2]]));

  // createActions: `case "a": case "b": case "c": {` builds a set of markers; the one in the menu owns the rest.
  const create = /export function createActions[\s\S]*?\n}\n/.exec(utils)![0];
  const owner: Record<string, string> = {};
  const menuTypes = new Set(menu.flatMap((g) => g.types));
  let run: string[] = [];
  for (const line of create.split("\n")) {
    const c = /^\s*case "(\w+)":\s*(\{)?\s*$/.exec(line);
    if (c) run.push(c[1]);
    if (!c || c[2]) {
      if (run.length > 1) {
        const head = run.find((t) => menuTypes.has(t));
        if (head) run.filter((t) => t !== head).forEach((t) => (owner[t] = head));
      }
      if (!c || c[2]) run = [];
    }
  }

  const waits = new Set(strings(/export function hasWait[\s\S]*?\[([^\]]*)\]/.exec(utils)![1]));

  const en = JSON.parse(read("src/i18n/en.json"));
  const groupOf: Record<string, string> = {};
  menu.forEach((g) => g.types.forEach((t) => (groupOf[t] = g.id)));

  const actions: Record<string, ActionInfo> = {};
  for (const type of available) {
    const partOf = owner[type];
    actions[type] = {
      name: en.actions.types[type]?.name ?? type,
      desc: en.actions.types[type]?.desc ?? "",
      group: groupOf[type] ?? groupOf[partOf] ?? "general",
      icon: iconOf[type] ?? "Circle",
      menu: menuTypes.has(type),
      wait: waits.has(type),
      ...(partOf ? { partOf } : {}),
    };
  }

  const icons: ActionData["icons"] = {};
  const iconSource = read("src/icons/icons.ts");
  const wanted = new Set([...Object.values(actions).map((a) => a.icon), ...Object.values(groupIcon)]);
  for (const m of iconSource.matchAll(/^\s+(\w+): \{ viewBox: "([^"]*)", body: ("(?:[^"\\]|\\.)*") \},?$/gm)) {
    if (wanted.has(m[1])) icons[m[1]] = { viewBox: m[2], body: JSON.parse(m[3]) };
  }

  const data: ActionData = {
    groups: menu.map((g) => ({ id: g.id, name: en.actions.groups[g.id] ?? g.id, icon: groupIcon[g.id] ?? "Circle", types: g.types })),
    actions,
    icons,
  };
  writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n");
  console.log(`synced ${Object.keys(actions).length} actions from ${LUNCHPAD}`);
  return data;
}

/** Action types a docs page claims in its `actionTypes` frontmatter. */
function documentedTypes(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.mdx?$/.test(entry.name)) {
        const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, "utf8"))?.[1] ?? "";
        const list = /actionTypes:\s*\[([^\]]*)\]/.exec(front)?.[1] ?? "";
        list.split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean).forEach((t) => found.set(t, relative(DOCS, path)));
      }
    }
  };
  if (existsSync(PAGES)) walk(PAGES);
  return found;
}

function check(data: ActionData): boolean {
  const pages = documentedTypes();
  const problems: string[] = [];
  for (const [type, info] of Object.entries(data.actions)) {
    if (!pages.has(type)) problems.push(`${type} (${info.name}): no page lists it in actionTypes`);
    if (info.menu && !existsSync(join(SHOTS, `${type}.png`))) problems.push(`${type} (${info.name}): no screenshot src/assets/screenshots/actions/${type}.png`);
  }
  for (const [type, page] of pages) if (!data.actions[type]) problems.push(`${page} documents "${type}", which the app does not have (renamed or removed?)`);
  if (problems.length) {
    console.error(`Action docs are out of date:\n  - ${problems.join("\n  - ")}\nSee CONTRIBUTING.md → "When a new action ships".`);
    return false;
  }
  console.log(`all ${Object.keys(data.actions).length} actions are documented, with screenshots`);
  return true;
}

const onlyCheck = process.argv.includes("--check");
const data: ActionData = onlyCheck || !existsSync(LUNCHPAD) ? JSON.parse(readFileSync(DATA, "utf8")) : sync();
process.exit(check(data) ? 0 : 1);

// Keeps the action reference in step with the app.
//
//   node scripts/actions.ts          sync src/data/actions.json from ../lunchpad, then check
//   node scripts/actions.ts --check  only check (no Lunchpad checkout needed)
//
// Sync reads the app's own sources: the action list (src/lib/api.ts), the
// "Add action" menu (ActionsTab.tsx), the icon names (actionUtils.ts) and the
// English names (i18n/en.json). The app draws those icons with lucide-react, so
// the drawings themselves come from lucide-static here, by the same name. The
// check fails when an action the app ships has no docs page or no screenshot.
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
/** One field of an action's JSON, as serde reads it. */
interface FieldInfo {
  name: string;
  /** "text", "number", "true or false", or the name of an entry in `types` */
  type: string;
  /** `Option<T>`: null is allowed */
  nullable?: boolean;
  /** `Vec<T>`: a list of `type` */
  list?: boolean;
  /** has a `#[serde(default)]`, so a script may leave it out */
  optional?: boolean;
  doc?: string;
}
interface PayloadInfo {
  doc?: string;
  fields: FieldInfo[];
}
/** A type an action's field refers to: a set of strings, an object, or a tagged union. */
interface TypeInfo {
  kind: "enum" | "object" | "union";
  doc?: string;
  values?: { value: string; doc?: string; default?: boolean }[];
  fields?: FieldInfo[];
  tag?: string;
  variants?: { value: string; doc?: string; default?: boolean; fields: FieldInfo[] }[];
}

interface ActionData {
  groups: { id: string; name: string; icon: string; types: string[] }[];
  actions: Record<string, ActionInfo>;
  icons: Record<string, { viewBox: string; body: string }>;
  /** The JSON each action is, for `Lunchpad.run()` in a script. */
  payloads: Record<string, PayloadInfo>;
  /** The types those payloads refer to. */
  types: Record<string, TypeInfo>;
}

// ----- the JSON an action is, read from the Rust model --------------------------
//
// `Lunchpad.run({ … })` hands the engine exactly the JSON it deserialises into
// `ActionKind`, so this is generated from that enum rather than written by hand:
// the field names as serde renames them, which fields carry a `#[serde(default)]`
// (those a script may leave out), and the doc comments as their description.
// An action missing a field that has no default is logged and skipped, so the
// required / optional split is the part that matters most.

/** Types the action payloads refer to, and where they live. */
const TYPE_SOURCES: Record<string, string> = {
  "src-tauri/src/macros/model.rs":
    "CompareOp VarScope HttpMethod HttpResponse HttpHeader HttpBodyMode HttpFilePart HttpAuth ButtonRef ButtonTrigger Keystroke KeyEvent ObsTarget ObsMode VisibilityMode MuteMode VolumeUnit SystemVolumeMode SystemVolumeTarget StudioMode WindowTarget WindowOp MouseStep ScrollAxis",
  "src-tauri/src/profile/model.rs": "PadColor",
  "src-tauri/src/desktop/mod.rs": "TitleMatch",
  "src-tauri/src/input/mod.rs": "MouseButton",
  "src-tauri/src/homeassistant/mod.rs": "HaPower HaValueKind",
};

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** A Rust type as the docs name it: a primitive, or a type in `types`. */
function fieldType(rust: string): Pick<FieldInfo, "type" | "nullable" | "list"> {
  const option = /^Option<(.+)>$/.exec(rust);
  if (option) return { ...fieldType(option[1]), nullable: true };
  const vec = /^Vec<(.+)>$/.exec(rust);
  if (vec) return { ...fieldType(vec[1]), list: true };
  if (rust === "String") return { type: "text" };
  if (rust === "bool") return { type: "true or false" };
  if (/^(u8|u16|u32|u64|usize|i8|i16|i32|i64|f32|f64)$/.test(rust)) return { type: "number" };
  return { type: rust };
}

/** `name: Type,` lines of a block, with their doc comments and serde defaults. */
function parseFields(block: string): FieldInfo[] {
  const fields: FieldInfo[] = [];
  let doc: string[] = [];
  let defaulted = false;
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("///")) {
      doc.push(line.slice(3).trim());
      continue;
    }
    if (line.startsWith("#[serde(default")) {
      defaulted = true;
      continue;
    }
    if (line.startsWith("#[")) continue;
    const m = /^(?:pub )?([a-z_0-9]+):\s*(.+?),?$/.exec(line);
    if (!m) continue;
    fields.push({
      name: snakeToCamel(m[1]),
      ...fieldType(m[2].replace(/,$/, "").trim()),
      ...(defaulted ? { optional: true } : {}),
      ...(doc.length ? { doc: doc.join(" ") } : {}),
    });
    doc = [];
    defaulted = false;
  }
  return fields;
}

/** Walk an enum body, yielding each variant with its inline or block fields. */
function parseVariants(body: string): { name: string; doc?: string; default?: boolean; fields: FieldInfo[] }[] {
  const out: { name: string; doc?: string; default?: boolean; fields: FieldInfo[] }[] = [];
  const lines = body.split("\n");
  let doc: string[] = [];
  let isDefault = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("///")) {
      doc.push(line.slice(3).trim());
      continue;
    }
    if (line === "#[default]") {
      isDefault = true;
      continue;
    }
    if (line.startsWith("#[")) continue;
    const inline = /^([A-Z][A-Za-z0-9]*)\s*\{(.*)\}\s*,?$/.exec(line);
    const block = /^([A-Z][A-Za-z0-9]*)\s*\{$/.exec(line);
    const bare = /^([A-Z][A-Za-z0-9]*)\s*,$/.exec(line);
    if (!inline && !block && !bare) continue;
    const name = (inline ?? block ?? bare)![1];
    let fields: FieldInfo[] = [];
    if (inline) fields = parseFields(inline[2].split(";").join("\n").replace(/,\s*(?=[a-z_]+:)/g, ",\n"));
    if (block) {
      const collected: string[] = [];
      let depth = 1;
      while (++i < lines.length) {
        const inner = lines[i];
        depth += (inner.match(/\{/g)?.length ?? 0) - (inner.match(/\}/g)?.length ?? 0);
        if (depth === 0) break;
        collected.push(inner);
      }
      fields = parseFields(collected.join("\n"));
    }
    out.push({ name, ...(doc.length ? { doc: doc.join(" ") } : {}), ...(isDefault ? { default: true } : {}), fields });
    doc = [];
    isDefault = false;
  }
  return out;
}

/** The `ActionKind` variants, and every type their fields refer to. */
function schema(): { payloads: Record<string, PayloadInfo>; types: Record<string, TypeInfo> } {
  const model = read("src-tauri/src/macros/model.rs");
  const body = /pub enum ActionKind \{\n([\s\S]*?)\n\}\n/.exec(model)![1];
  const payloads: Record<string, PayloadInfo> = {};
  for (const variant of parseVariants(body)) {
    payloads[camel(variant.name)] = { ...(variant.doc ? { doc: variant.doc } : {}), fields: variant.fields };
  }

  const types: Record<string, TypeInfo> = {};
  for (const [file, names] of Object.entries(TYPE_SOURCES)) {
    const source = read(file);
    for (const name of names.split(" ")) {
      // The attributes above the definition say how it is tagged.
      const at = new RegExp(`((?:^\\s*(?:///|#\\[).*\\n)*)pub (enum|struct) ${name} \\{\\n([\\s\\S]*?)\\n\\}`, "m").exec(source);
      if (!at) continue;
      const [, attrs, kind, block] = at;
      const doc = [...attrs.matchAll(/^\s*\/\/\/ ?(.*)$/gm)].map((m) => m[1].trim()).join(" ");
      const tag = /#\[serde\([^)]*tag = "(\w+)"/.exec(attrs)?.[1];
      if (kind === "struct") {
        types[name] = { kind: "object", ...(doc ? { doc } : {}), fields: parseFields(block) };
        continue;
      }
      const variants = parseVariants(block);
      if (tag) {
        types[name] = {
          kind: "union",
          ...(doc ? { doc } : {}),
          tag,
          variants: variants.map((v) => ({ value: camel(v.name), ...(v.doc ? { doc: v.doc } : {}), ...(v.default ? { default: true } : {}), fields: v.fields })),
        };
      } else {
        types[name] = {
          kind: "enum",
          ...(doc ? { doc } : {}),
          values: variants.map((v) => ({ value: camel(v.name), ...(v.doc ? { doc: v.doc } : {}), ...(v.default ? { default: true } : {}) })),
        };
      }
    }
  }
  return { payloads, types };
}

const read = (path: string) => readFileSync(join(LUNCHPAD, path), "utf8");
const strings = (list: string) => [...list.matchAll(/"(\w+)"/g)].map((m) => m[1]);

/** Lucide's SVGs, from this project's node_modules; the app draws the same set with lucide-react. */
const LUCIDE = join(DOCS, "node_modules/lucide-static/icons");

/** `MousePointerClick` → `mouse-pointer-click`, `Volume2` → `volume-2`: how Lucide names its files. */
const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();

/**
 * One icon, ready to drop into an `<svg>`. Lucide draws with strokes and keeps
 * the attributes on its own `<svg>` tag; `ActionIcon.astro` renders the body
 * into a bare one, so they travel with the body instead — without them a
 * stroked icon comes out invisible.
 */
function lucideIcon(name: string): { viewBox: string; body: string } {
  const file = join(LUCIDE, `${kebab(name)}.svg`);
  if (!existsSync(file)) {
    throw new Error(`No Lucide icon "${kebab(name)}.svg" for "${name}". The app names its icons after lucide-react components; check the spelling in actionUtils.ts, or run "bun install" here.`);
  }
  const svg = readFileSync(file, "utf8");
  const tag = /<svg[^>]*>/.exec(svg)![0];
  const viewBox = /viewBox="([^"]+)"/.exec(tag)?.[1] ?? "0 0 24 24";
  const body = svg.slice(svg.indexOf(tag) + tag.length).replace("</svg>", "").trim().replace(/\s+/g, " ");
  return { viewBox, body: `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>` };
}

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
  const wanted = new Set([...Object.values(actions).map((a) => a.icon), ...Object.values(groupIcon)]);
  for (const name of [...wanted].sort()) icons[name] = lucideIcon(name);

  const { payloads, types } = schema();
  const missing = Object.keys(actions).filter((t) => !payloads[t]);
  if (missing.length) throw new Error(`No JSON payload found for ${missing.join(", ")}. Did ActionKind in src-tauri/src/macros/model.rs change shape?`);

  const data: ActionData = {
    groups: menu.map((g) => ({ id: g.id, name: en.actions.groups[g.id] ?? g.id, icon: groupIcon[g.id] ?? "Circle", types: g.types })),
    actions,
    icons,
    payloads,
    types,
  };
  writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n");
  console.log(`synced ${Object.keys(actions).length} actions from ${LUNCHPAD}, with ${Object.keys(payloads).length} payloads and ${Object.keys(types).length} types`);
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

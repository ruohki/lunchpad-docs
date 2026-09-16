// Takes the documentation screenshots from the real Lunchpad interface.
//
//   node scripts/screenshots/capture.ts               every shot
//   node scripts/screenshots/capture.ts playSound app  only shots whose name contains one of the words
//
// Each shot gets a fresh page: the fake backend (mock/) starts from the demo
// data plus the shot's scenario, the platform reads as Windows, and dialogs
// grow to their full height so nothing is cut off.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { DOCS, startServer } from "./serve.ts";
import { actionShots } from "./scenarios/actions.ts";
import { appShots } from "./scenarios/app.ts";
import { WINDOW, type Shot } from "./shot.ts";

const OUT = join(DOCS, "src/assets/screenshots");
const CAPTURE_CSS = `
  [role="dialog"] { max-height: none !important; height: auto !important; }
`;

const filters = process.argv.slice(2);
const shots: Shot[] = [...appShots, ...actionShots].filter((s) => filters.length === 0 || filters.some((f) => s.name.includes(f)));
if (shots.length === 0) {
  console.error(`No shot matches ${filters.join(", ")}`);
  process.exit(1);
}

const server = await startServer(Number(process.env.PORT ?? 1430));
const browser = await chromium.launch();
const failed: string[] = [];

for (const shot of shots) {
  const context = await browser.newContext({ viewport: shot.viewport ?? WINDOW, deviceScaleFactor: 2, reducedMotion: "no-preference" });
  await context.addInitScript((scenario) => {
    // Windows labels (Ctrl, Alt) and Windows-only switches, like most users see them.
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    (window as unknown as { __LUNCHPAD_SCENARIO__: unknown }).__LUNCHPAD_SCENARIO__ = scenario;
  }, shot.scenario ?? {});
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(server.url);
    await page.addStyleTag({ content: CAPTURE_CSS });
    await page.waitForSelector(shot.scenario?.view === "picker" ? "text=Choose your Launchpad" : '[data-pad="0,0"]', { timeout: 30_000 });
    await page.waitForTimeout(1200); // pads fade in one by one
    const target = shot.run ? await shot.run(page) : undefined;
    // A dialog grown to its full height (CAPTURE_CSS) can end up taller than the window.
    // It is centred and fixed, so the overflow goes off the top of the screen and the shot
    // loses the dialog's header. Give the window the room it needs and let it settle.
    if (target) {
      const box = await target.boundingBox();
      const size = page.viewportSize()!;
      const needed = Math.ceil((box?.height ?? 0) + (shot.margin ?? 0) * 2 + 40);
      if (needed > size.height) {
        await page.setViewportSize({ width: size.width, height: Math.min(needed, 4000) });
        await page.waitForTimeout(400);
      }
    }
    const path = join(OUT, `${shot.name}.png`);
    mkdirSync(dirname(path), { recursive: true });
    if (target && shot.margin) {
      await target.scrollIntoViewIfNeeded();
      const box = (await target.boundingBox())!;
      const size = page.viewportSize()!;
      const x = Math.max(0, box.x - shot.margin);
      const y = Math.max(0, box.y - shot.margin);
      const clip = { x, y, width: Math.min(size.width, box.x + box.width + shot.margin) - x, height: Math.min(size.height, box.y + box.height + shot.margin) - y };
      await page.screenshot({ path, clip, animations: "disabled" });
    } else if (target) await target.screenshot({ path, animations: "disabled" });
    else await page.screenshot({ path, animations: "disabled" });
    if (errors.length) throw new Error(errors.join("; "));
    console.log(`✓ ${shot.name}`);
  } catch (e) {
    failed.push(shot.name);
    console.error(`✗ ${shot.name}: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await context.close();
  }
}

await browser.close();
await server.close();
if (failed.length) {
  console.error(`${failed.length} of ${shots.length} shots failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(`${shots.length} screenshots in ${OUT}`);

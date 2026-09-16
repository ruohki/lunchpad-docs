// Screenshots of the app itself for the guides: src/assets/screenshots/app/<name>.png,
// shown by <AppShot name="…">.
import type { Action, ActionKind } from "@app/lib/api";
import { openActionsTab, openEditor, openFaderEditor, openSettings, pad, settle, TALL, WINDOW, type Shot } from "../shot.ts";

const act = (kind: ActionKind): Action => ({ id: `app-${Math.random().toString(36).slice(2)}`, wait: true, ...kind }) as Action;

const settingsTabs: [string, string][] = [
  ["launchpad", "Launchpad"],
  ["sound", "Sound"],
  ["keyboard", "Keyboard & mouse"],
  ["interface", "Interface"],
  ["obs", "OBS Studio"],
  ["slobs", "Streamlabs Desktop"],
  ["home-assistant", "Home Assistant"],
  ["pages", "Pages & backup"],
  ["variables", "Variables"],
  ["secrets", "Secrets"],
  ["about", "About Lunchpad"],
  ["diagnostics", "Diagnostics"],
];

export const appShots: Shot[] = [
  { name: "app/main-window", viewport: WINDOW },

  {
    name: "app/device-picker",
    viewport: WINDOW,
    scenario: { view: "picker" },
    run: async (page) => {
      await page.getByText(/Launchpads? found/).waitFor();
      await settle(page, 600);
    },
  },

  {
    name: "app/connect-by-hand",
    viewport: WINDOW,
    scenario: { view: "picker" },
    margin: 12,
    run: async (page) => {
      const box = page.getByText("Not listed? Connect by hand.").locator("xpath=..");
      await box.waitFor();
      await box.scrollIntoViewIfNeeded();
      await settle(page, 500);
      return box;
    },
  },

  {
    name: "app/context-menu",
    viewport: WINDOW,
    run: async (page) => {
      await pad(page, 1, 6).click({ button: "right" });
      await page.getByRole("menu").waitFor();
      await page.waitForTimeout(400);
    },
  },

  {
    name: "app/outside-panel",
    viewport: WINDOW,
    scenario: { outside: true },
    run: async (page) => {
      await page.getByRole("button", { name: "Show them" }).click();
      // The notice has done its job once the panel is open; it would cover it.
      await page.getByRole("button", { name: "Dismiss" }).first().click();
      await settle(page, 700);
    },
  },

  {
    name: "app/button-editor",
    viewport: TALL,
    scenario: { focus: { look: { type: "text", caption: "Horn", size: 18, face: "rounded", color: "#15151b" }, color: { mode: "rgb", r: 255, g: 196, b: 40 }, activeColor: { mode: "rgb", r: 255, g: 122, b: 26 } } },
    run: async (page) => {
      const dialog = await openEditor(page);
      await dialog.locator("input").first().blur();
      return dialog;
    },
  },

  {
    name: "app/button-editor-actions",
    viewport: TALL,
    scenario: {
      focus: {
        look: { type: "text", caption: "Mic", size: 16, face: "sans", color: "#ffffff" },
        color: { mode: "rgb", r: 255, g: 48, b: 48 },
        down: [act({ type: "obsSetAudio", scene: "", collection: "", source: "Mic/Aux", muted: false, muteMode: "toggle", volumeDb: 0, volumeFrom: null, volumeUnit: "db", setVolume: false })],
        hold: [act({ type: "playSound", file: "C:\\Users\\Demo\\Sounds\\mic-check.wav", volume: 1, start: 0, end: 1, outputDevice: null, volumeFromVelocity: false })],
        holdMs: 600,
      },
    },
    run: async (page) => {
      await openEditor(page);
      return openActionsTab(page);
    },
  },

  {
    name: "app/add-action-menu",
    viewport: { width: 1000, height: 900 },
    run: async (page) => {
      const dialog = await openEditor(page);
      await openActionsTab(page);
      await dialog.getByRole("button", { name: /Add action/ }).first().click();
      const media = page.getByRole("menuitem", { name: /Media/ }).first();
      await media.hover();
      await page.waitForTimeout(500);
    },
  },

  {
    // The "Clap" button of the demo page carries the description (fixtures.ts).
    name: "app/button-description",
    viewport: WINDOW,
    // No settle(): the pointer has to stay on the pad for the tooltip.
    run: async (page) => {
      await pad(page, 2, 5).hover();
      await page.waitForTimeout(1400);
    },
  },

  // Keyboard models: both boards, and the fader editors of a knob and a touch strip.
  { name: "app/launchkey", viewport: { width: 1020, height: 560 }, scenario: { model: "LaunchkeyMiniMk3" } },
  { name: "app/launchkey-mk4", viewport: { width: 1020, height: 620 }, scenario: { model: "LaunchkeyMiniMk4" } },

  {
    name: "app/fader-strip-actions",
    viewport: TALL,
    scenario: { model: "LaunchkeyMiniMk3" },
    run: async (page) => {
      // The modulation strip carries the demo "mic" fader, with all three lists filled in.
      await pad(page, 1, 6).click({ button: "right" });
      await page.getByRole("menuitem", { name: /Edit fader/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByRole("button", { name: /^Actions/ }).click();
      await settle(page, 600);
      return dialog;
    },
  },

  {
    name: "app/fader-knob",
    viewport: TALL,
    scenario: { model: "LaunchkeyMiniMk3" },
    run: async (page) => {
      // The knob that already carries the demo fader: a named fader reads better than an empty one.
      await pad(page, 4, 6).click({ button: "right" });
      await page.getByRole("menuitem", { name: /Edit fader/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await settle(page);
      return dialog;
    },
  },

  { name: "app/fader-editor", viewport: TALL, run: (page) => openFaderEditor(page) },

  {
    name: "app/fader-editor-actions",
    viewport: TALL,
    run: async (page) => {
      const dialog = await openFaderEditor(page);
      await dialog.getByRole("button", { name: /^Actions/ }).click();
      await settle(page);
      await dialog.locator("section > ul > li button[aria-expanded]").first().click();
      await settle(page, 600);
      return dialog;
    },
  },

  {
    // Right-clicking an action row: copy, duplicate, paste and remove. The menu is rendered
    // outside the dialog and is taller than the row, so the clip is anchored on the menu itself
    // (an element screenshot of the list would leave the menu out, a short viewport hides the row).
    name: "app/action-menu",
    viewport: TALL,
    // Wide enough that the rows behind the menu are whole, not cut mid-label.
    margin: 330,
    scenario: {
      focus: {
        down: [
          act({ type: "obsSwitchScene", scene: "Be right back", collection: "" }),
          act({ type: "playSound", file: "C:\\Users\\Demo\\Sounds\\brb.wav", volume: 1, start: 0, end: 1, outputDevice: null, volumeFromVelocity: false }),
        ],
      },
    },
    run: async (page) => {
      await openEditor(page);
      const dialog = await openActionsTab(page);
      const row = dialog.locator("section").first().locator(":scope > ul > li").first();
      await row.click({ button: "right" });
      const menu = page.getByRole("menu");
      await menu.waitFor();
      await page.waitForTimeout(400);
      return menu;
    },
  },

  {
    // The script editor grown to the whole window, with its colours.
    name: "app/code-maximized",
    viewport: { width: 1100, height: 820 },
    scenario: {
      focus: {
        down: [
          act({
            type: "runScript",
            code: "// Pick the loudest scene of the last poll and announce it.\nfunction ordinal(n) {\n  const s = ['th', 'st', 'nd', 'rd'];\n  return n + (s[(n % 100 - 20) % 10] ?? s[n % 100] ?? s[0]);\n}\n\nconst deaths = Number(globals.deaths ?? 0) + 1;\nglobals.deaths = deaths;\n\nreturn `${ordinal(deaths)} death of the stream`;",
            saveTo: "message",
            saveScope: "local",
          }),
        ],
      },
    },
    run: async (page) => {
      await openEditor(page);
      const dialog = await openActionsTab(page);
      await dialog.locator("section").first().locator(":scope > ul > li").first().locator("button[aria-expanded]").first().click();
      await settle(page, 400);
      await page.getByRole("button", { name: "Maximize the editor" }).first().click();
      await settle(page, 600);
    },
  },

  ...settingsTabs.map(([name, label]): Shot => ({ name: `app/settings-${name}`, viewport: TALL, run: (page) => openSettings(page, label) })),

  {
    name: "app/developer-mode",
    viewport: { width: 1180, height: 820 },
    scenario: { developerMode: true, running: [[1, 5]] },
  },
];

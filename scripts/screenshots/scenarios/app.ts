// Screenshots of the app itself for the guides: src/assets/screenshots/app/<name>.png,
// shown by <AppShot name="…">.
import type { Action, ActionKind } from "@app/lib/api";
import { openActionsTab, openEditor, openFaderEditor, openSettings, pad, settle, TALL, WINDOW, type Shot } from "../shot.ts";

const act = (kind: ActionKind): Action => ({ id: `app-${Math.random().toString(36).slice(2)}`, wait: true, ...kind }) as Action;

const settingsTabs: [string, string][] = [
  ["launchpad", "Launchpad"],
  ["sound", "Sound"],
  ["keyboard", "Keyboard"],
  ["interface", "Interface"],
  ["obs", "OBS Studio"],
  ["slobs", "Streamlabs Desktop"],
  ["home-assistant", "Home Assistant"],
  ["pages", "Pages & backup"],
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
    name: "app/context-menu",
    viewport: WINDOW,
    run: async (page) => {
      await pad(page, 1, 6).click({ button: "right" });
      await page.getByRole("menu").waitFor();
      await page.waitForTimeout(400);
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

  ...settingsTabs.map(([name, label]): Shot => ({ name: `app/settings-${name}`, viewport: TALL, run: (page) => openSettings(page, label) })),

  {
    name: "app/developer-mode",
    viewport: { width: 1180, height: 820 },
    scenario: { developerMode: true, running: [[1, 5]] },
  },
];

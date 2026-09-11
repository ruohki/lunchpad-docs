// What a screenshot is and the few moves every scenario needs.
import type { Locator, Page } from "playwright";
import type { Scenario } from "./mock/backend.ts";

export interface Shot {
  /** output path under src/assets/screenshots, without ".png" */
  name: string;
  /** start state for the fake backend (mock/backend.ts) */
  scenario?: Scenario;
  viewport?: { width: number; height: number };
  /** interact, then return the element to capture; nothing = the whole window */
  run?: (page: Page) => Promise<Locator | void>;
  /** CSS pixels of surrounding interface to include around the element */
  margin?: number;
}

/** The app window's default size (tauri.conf.json). */
export const WINDOW = { width: 780, height: 820 };
/** Room for dialogs grown to their full height. */
export const TALL = { width: 1000, height: 1500 };

export const pad = (page: Page, x: number, y: number) => page.locator(`[data-pad="${x},${y}"] button`).first();

/** Let animations finish and move the pointer out of the way (no hover states). */
export async function settle(page: Page, ms = 450) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(ms);
}

/** Right-click a pad and pick "Edit button…" / "Add button…". */
export async function openEditor(page: Page, x = 0, y = 7): Promise<Locator> {
  await pad(page, x, y).click({ button: "right" });
  await page.getByRole("menuitem", { name: /^(Edit|Add) button/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await settle(page);
  return dialog;
}

export async function openActionsTab(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Actions/ }).click();
  await settle(page);
  return dialog;
}

/** Right-click a pad of a fader and pick "Edit fader…" (the demo "volume" fader by default). */
export async function openFaderEditor(page: Page, x = 7, y = 2): Promise<Locator> {
  await pad(page, x, y).click({ button: "right" });
  await page.getByRole("menuitem", { name: /Edit fader/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await settle(page);
  return dialog;
}

/** Open the settings (the gear on the corner pad) at a tab, by its label. */
export async function openSettings(page: Page, tab: string): Promise<Locator> {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("tab", { name: tab, exact: true }).click();
  await settle(page, 600);
  return dialog;
}

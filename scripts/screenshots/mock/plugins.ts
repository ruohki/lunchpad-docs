// Stand-ins for the Tauri plugins the interface imports. One module serves all
// of them; serve.ts aliases each plugin path here.
import { scenario } from "./backend";

declare const __LUNCHPAD_VERSION__: string;

// @tauri-apps/api/app
export async function getVersion(): Promise<string> {
  return __LUNCHPAD_VERSION__;
}

// @tauri-apps/plugin-dialog: a scenario can pretend the user picked a file.
export async function open(): Promise<string | null> {
  return scenario.dialogPath ?? null;
}
export async function save(): Promise<string | null> {
  return null;
}

// @tauri-apps/plugin-opener
export async function openUrl(): Promise<void> {}

// @tauri-apps/plugin-process
export async function relaunch(): Promise<void> {}

// @tauri-apps/plugin-updater: never an update in screenshots.
export async function check(): Promise<null> {
  return null;
}
export type Update = never;

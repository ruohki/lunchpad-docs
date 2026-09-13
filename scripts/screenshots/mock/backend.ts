// A small in-browser stand-in for the Rust backend, so the real Lunchpad
// interface runs in a plain browser for screenshots. It answers every command
// in src/lib/api.ts with demo data (fixtures.ts) and emits the same events.
//
// A screenshot scenario tweaks the start state through
// `window.__LUNCHPAD_SCENARIO__` (set by capture.ts before the page loads).
import type { Button, DeviceState, Fader, LaunchpadModel, Page, Profile, Settings } from "@app/lib/api";
import { AUDIO, C, DISCOVERED, FILTERS, INPUTS, MODELS, VOICES, button, demoHomeAssistant, demoObs, demoProfile, demoSettings, demoSlobs, launchkeyPage, layoutFor, peaks } from "./fixtures";

export interface Scenario {
  /** "picker" starts without a connected Launchpad */
  view?: "workspace" | "picker";
  developerMode?: boolean;
  /** integrations switched on in the settings (default: both) */
  obs?: boolean;
  slobs?: boolean;
  /** whether OBS / Streamlabs answer (default: yes) */
  connected?: boolean;
  /** replaces the button at FOCUS_PAD on the first page */
  focus?: Partial<Button>;
  /** what the file dialog "picks" */
  dialogPath?: string;
  variables?: Record<string, string>;
  /** pads shown as running a macro */
  running?: [number, number][];
  /** what "Run test" in the script editor reports */
  scriptResult?: string;
  /** put two buttons on pads the connected Launchpad does not have (the "Out of sight" panel) */
  outside?: boolean;
  /** which device is connected (default: the Launchpad X) */
  model?: LaunchpadModel;
}

/** Top-left pad of the grid (column 1, row 8): where scenarios put their button. */
export const FOCUS_PAD = { x: 0, y: 7 };

export const scenario: Scenario = (globalThis as { __LUNCHPAD_SCENARIO__?: Scenario }).__LUNCHPAD_SCENARIO__ ?? {};

// ----- events --------------------------------------------------------------------

type Listener = (e: { event: string; id: number; payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(event: string, cb: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(cb);
  return () => listeners.get(event)?.delete(cb);
}

function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((cb) => cb({ event, id: 0, payload }));
}

// ----- state ---------------------------------------------------------------------

const settings: Settings = demoSettings();
settings.developerMode = scenario.developerMode ?? false;
settings.obs.enabled = scenario.obs ?? true;
settings.slobs.enabled = scenario.slobs ?? true;

const profile: Profile = demoProfile();
if (scenario.focus) {
  const page = profile.pages[0];
  const base = page.buttons.find((b) => b.x === FOCUS_PAD.x && b.y === FOCUS_PAD.y);
  page.buttons = page.buttons.filter((b) => b !== base);
  page.buttons.push({ ...(base ?? {}), down: [], up: [], hold: [], ...(base ? {} : { look: { type: "text", caption: "", size: 15, face: "sans", color: "#ffffff" }, color: { mode: "palette", index: 9 }, activeColor: null, loop: false, holdMs: 500, holdWait: true, stateLink: null }), ...scenario.focus, ...FOCUS_PAD } as Page["buttons"][number]);
}

// The demo pages are drawn for a Launchpad; a keyboard model gets its own page.
if (scenario.model === "LaunchkeyMiniMk3") profile.pages[0] = launchkeyPage();

if (scenario.outside) {
  // Pads 10 and 11 of a Launchpad Pro: no pad for them on the Launchpad X of the demo data.
  profile.pages[0].buttons.push({ ...button("Cue", C.violet), x: 9, y: 3 }, { ...button("Tempo", C.teal), x: 4, y: 9 });
}

const connected = scenario.connected ?? true;
const variables: Record<string, string> = scenario.variables ?? { deaths: "3", lastScene: "Gameplay", "fader.volume": "75" };

let device: DeviceState =
  scenario.view === "picker"
    ? { status: "disconnected", device: null, layout: null, savedDevice: settings.device, autoConnect: true, pressFeedback: true, pressThreshold: null, pressed: [], error: null }
    : connectedState(scenario.model ?? "LaunchpadX", false);

function connectedState(model: LaunchpadModel, virtual: boolean): DeviceState {
  const layout = layoutFor(model);
  return {
    status: "connected",
    device: { model, modelName: layout.modelName, inputName: virtual ? "" : "LPX MIDI", outputName: virtual ? "" : "LPX MIDI", firmware: virtual ? null : "0.2.3.8", virtual },
    layout,
    savedDevice: settings.device,
    autoConnect: true,
    pressFeedback: true,
    pressThreshold: null,
    pressed: [],
    error: null,
  };
}

function page(pageId: string): Page | undefined {
  return profile.pages.find((p) => p.id === pageId);
}

function changed<T>(result: T): T {
  emit("profile:changed", structuredClone(profile));
  return result;
}

function saveSettings(patch: Partial<Settings>): Settings {
  Object.assign(settings, patch);
  emit("settings:changed", structuredClone(settings));
  return structuredClone(settings);
}

const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

// ----- commands ------------------------------------------------------------------

type Args = Record<string, any>;

export function handle(cmd: string, a: Args): unknown {
  switch (cmd) {
    // device
    case "scan_launchpads":
      return DISCOVERED;
    case "connect_launchpad":
      device = connectedState(a.request.model, false);
      emit("device:state", device);
      return device;
    case "connect_virtual":
      device = connectedState(a.model, true);
      emit("device:state", device);
      return device;
    case "disconnect_launchpad":
      device = { ...device, status: "disconnected", device: null, layout: null };
      return device;
    case "get_device_state":
      return device;
    case "set_auto_connect":
      return (device = { ...device, autoConnect: a.enabled });
    case "set_press_feedback":
      return (device = { ...device, pressFeedback: a.enabled });
    case "set_press_threshold":
      return (device = { ...device, pressThreshold: a.threshold });
    case "forget_device":
      return (device = { ...device, savedDevice: null });
    case "get_layout":
      return layoutFor(a.model);
    case "list_models":
      return MODELS;
    case "press_pad":
    case "reset_leds":
    case "send_raw_midi":
      return null;

    // profile
    case "get_profile":
      return structuredClone(profile);
    case "set_active_page":
      profile.activePage = a.pageId;
      return changed(null);
    case "add_page": {
      const p: Page = { id: `page-${profile.pages.length + 1}`, name: a.name, buttons: [], faders: [] };
      profile.pages.push(p);
      return changed(p);
    }
    case "rename_page":
      page(a.pageId)!.name = a.name;
      return changed(null);
    case "remove_page":
      profile.pages = profile.pages.filter((p) => p.id !== a.pageId);
      return changed(null);
    case "duplicate_page": {
      const copy = { ...structuredClone(page(a.pageId)!), id: `page-${profile.pages.length + 1}` };
      profile.pages.push(copy);
      return changed(copy);
    }
    case "move_page": {
      const p = page(a.pageId)!;
      profile.pages = profile.pages.filter((x) => x !== p);
      profile.pages.splice(a.toIndex, 0, p);
      return changed(null);
    }
    case "set_button": {
      const p = page(a.pageId)!;
      p.buttons = [...p.buttons.filter((b) => b.x !== a.x || b.y !== a.y), { ...a.button, x: a.x, y: a.y }];
      return changed(null);
    }
    case "clear_button": {
      const p = page(a.pageId)!;
      p.buttons = p.buttons.filter((b) => b.x !== a.x || b.y !== a.y);
      return changed(null);
    }
    case "set_fader": {
      const p = page(a.pageId)!;
      const fader: Fader = { ...a.fader, id: a.fader.id || `fader-${Date.now()}` };
      p.faders = [...p.faders.filter((f) => f.id !== fader.id), fader];
      return changed(null);
    }
    case "remove_fader": {
      const p = page(a.pageId)!;
      p.faders = p.faders.filter((f) => f.id !== a.faderId);
      return changed(null);
    }
    case "move_fader": {
      const f = page(a.pageId)!.faders.find((x) => x.id === a.faderId)!;
      Object.assign(f, { x: a.x, y: a.y });
      return changed(null);
    }
    case "move_button": {
      const p = page(a.pageId)!;
      const from = p.buttons.find((b) => b.x === a.from.x && b.y === a.from.y);
      if (!from) return null;
      p.buttons = p.buttons.filter((b) => (a.copy ? true : b !== from) && (b.x !== a.to.x || b.y !== a.to.y));
      p.buttons.push({ ...structuredClone(from), ...a.to });
      return changed(null);
    }
    case "undo_profile":
    case "redo_profile":
      return false;
    case "history_state":
      return { undo: 3, redo: 0 };
    case "missing_sound_files":
      return [];
    case "export_page":
      return JSON.stringify(page(a.pageId));
    case "import_legacy_json":
    case "import_legacy_file":
    case "import_page_json":
    case "import_page_file":
      return { pages: 1, buttons: 12, actions: 30, warnings: [] };
    case "restore_profile_backup":
      return structuredClone(profile);
    case "read_image_data_uri":
      return "";
    case "open_log_dir":
    case "export_page_file":
      return null;

    // settings
    case "get_settings":
      return structuredClone(settings);
    case "set_push_to_talk":
      return saveSettings({ pushToTalk: a.config });
    case "set_developer_mode":
      return saveSettings({ developerMode: a.enabled });
    case "set_window_settings":
      return saveSettings({ window: a.config });
    case "set_audio_settings":
      return saveSettings({ audio: a.config });
    case "set_obs_settings":
      return saveSettings({ obs: a.config });
    case "set_slobs_settings":
      return saveSettings({ slobs: a.config });
    case "set_home_assistant_settings":
      return saveSettings({ homeAssistant: a.config });
    case "check_keyboard_access":
    case "set_tray_labels":
      return null;
    case "diagnostics":
      return {
        appVersion: "1.0.0",
        tauriVersion: "2.8.0",
        webviewVersion: "140.0.3485.54",
        os: { name: "Windows", version: "11 (26100)", arch: "x86_64" },
        configDir: "C:\\Users\\Demo\\AppData\\Roaming\\com.lunchpad.app",
        logDir: "C:\\Users\\Demo\\AppData\\Roaming\\com.lunchpad.app\\logs",
        device: { status: "connected", model: "Launchpad X", input: "LPX MIDI", output: "LPX MIDI", firmware: "0.2.3.8", isVirtual: false, error: null, autoConnect: true, remembered: "Launchpad X on LPX MIDI" },
        midiInputs: ["LPX DAW", "LPX MIDI"],
        midiOutputs: ["LPX DAW", "LPX MIDI", "Microsoft GS Wavetable Synth"],
        midiError: null,
        audio: { defaultDevice: AUDIO.default, devices: AUDIO.devices, configured: null },
        integrations: [
          { name: "OBS Studio", enabled: true, endpoint: "ws://localhost:4455", connected, error: null },
          { name: "Streamlabs Desktop", enabled: true, endpoint: "ws://127.0.0.1:28194", connected, error: null },
          { name: "Home Assistant", enabled: true, endpoint: "http://homeassistant.local:8123", connected, error: null },
        ],
        profile: { pages: profile.pages.length, buttons: profile.pages.reduce((n, p) => n + p.buttons.length, 0), actions: 42 },
        settings: { developerMode: settings.developerMode, pushToTalk: "v", stayOnTop: false, minimizeToTray: true, runAtStartup: true },
      };

    // media
    case "list_audio_devices":
      return AUDIO;
    case "list_system_audio_devices":
      return a.target === "input" ? INPUTS : AUDIO.devices;
    case "analyze_audio":
      return { durationSecs: 3.4, peaks: peaks(a.buckets ?? 160) };
    case "preview_sound":
      return 1;
    case "stop_sound":
    case "stop_all_sounds":
    case "preview_speech":
    case "stop_speech":
      return null;
    case "file_name":
      return basename(a.path);
    case "list_voices":
      return VOICES;

    // integrations
    case "obs_state":
    case "obs_connect":
    case "obs_refresh":
      return demoObs(connected);
    case "obs_disconnect":
      return demoObs(false);
    case "obs_filters":
    case "slobs_filters":
      return FILTERS;
    case "slobs_state":
    case "slobs_connect":
    case "slobs_refresh":
      return demoSlobs(connected);
    case "slobs_disconnect":
      return demoSlobs(false);
    case "home_assistant_state":
    case "home_assistant_refresh":
      return demoHomeAssistant(connected && settings.homeAssistant.enabled);

    // macros and variables
    case "test_http_request":
      return { status: 200, ok: true, elapsedMs: 142, bodyPreview: '{\n  "ok": true,\n  "viewers": 128\n}' };
    case "test_script":
      return { result: scenario.scriptResult ?? "ok", locals: {}, globals: {}, elapsedMs: 3 };
    case "get_variables":
      return variables;
    case "delete_variables":
      (a.names as string[]).forEach((name) => delete variables[name]);
      return variables;
    case "clear_variables":
      Object.keys(variables).forEach((name) => delete variables[name]);
      return variables;
    case "prune_fader_variables":
      return 0;
    case "get_running_macros":
      return (scenario.running ?? []).map(([x, y], i) => ({ id: `run-${i}`, pageId: profile.activePage, x, y, list: "down", startedAtMs: Date.now() }));
    case "stop_all_macros":
    case "stop_macros_at":
      return null;
    case "run_button":
      return true;

    default:
      console.warn(`[mock backend] unhandled command ${cmd}`, a);
      return null;
  }
}

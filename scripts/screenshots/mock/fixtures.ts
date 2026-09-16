// Demo data the fake backend serves: a connected Launchpad X, three pages of
// buttons, a fader, OBS and Streamlabs with a few scenes. Keep it believable,
// it is what every screenshot shows.
import type {
  AudioDevices,
  Button,
  DiscoveredLaunchpad,
  DownloadCacheInfo,
  Fader,
  HaEntity,
  HaState,
  Layout,
  LaunchpadModel,
  Page,
  ModelInfo,
  ObsState,
  PadColor,
  PadSpec,
  PlacedButton,
  Profile,
  Settings,
  SlobsState,
  VoiceInfo,
} from "@app/lib/api";
import launchkeyMiniMk3 from "./layouts/LaunchkeyMiniMk3.json";
import launchkeyMiniMk4 from "./layouts/LaunchkeyMiniMk4.json";
import launchpadMiniMk3 from "./layouts/LaunchpadMiniMk3.json";
import launchpadProMk3 from "./layouts/LaunchpadProMk3.json";
import launchpadX from "./layouts/LaunchpadX.json";

// ----- layouts -----------------------------------------------------------------

const X_TOP = ["▲", "▼", "◀", "▶", "Session", "Note", "Custom", "● Capture"];
const X_RIGHT = ["Volume", "Pan", "Send A", "Send B", "Stop Clip", "Mute", "Solo", "Rec Arm"];

export const MODELS: ModelInfo[] = [
  { model: "LaunchpadMk2", name: "Launchpad MK2" },
  { model: "LaunchpadX", name: "Launchpad X" },
  { model: "LaunchpadMiniMk3", name: "Launchpad Mini MK3" },
  { model: "LaunchpadProMk2", name: "Launchpad Pro MK2" },
  { model: "LaunchpadProMk3", name: "Launchpad Pro MK3" },
  { model: "LaunchpadLegacy", name: "Launchpad (first generation)" },
  { model: "LaunchkeyMiniMk3", name: "Launchkey Mini MK3" },
  { model: "LaunchkeyMiniMk4", name: "Launchkey Mini MK4" },
];

/**
 * Real layouts dumped from the app's drivers, so a shot shows the surface exactly as the app
 * draws it. Refresh them whenever a driver's layout changes, from `src-tauri`:
 *
 *   for m in LaunchpadX LaunchpadMiniMk3 LaunchpadProMk3 LaunchkeyMiniMk3 LaunchkeyMiniMk4
 *     cargo run --quiet --example layoutdump -- $m > <docs>/scripts/screenshots/mock/layouts/$m.json
 *   end
 */
const REAL_LAYOUTS: Partial<Record<LaunchpadModel, Layout>> = {
  LaunchpadX: launchpadX as Layout,
  LaunchpadMiniMk3: launchpadMiniMk3 as Layout,
  LaunchpadProMk3: launchpadProMk3 as Layout,
  LaunchkeyMiniMk3: launchkeyMiniMk3 as Layout,
  LaunchkeyMiniMk4: launchkeyMiniMk4 as Layout,
};

/** The model's real layout when one is dumped here, else the 9 × 9 layout of the X (close enough for screenshots of every other 8 × 8 model). */
export function layoutFor(model: LaunchpadModel): Layout {
  const real = REAL_LAYOUTS[model];
  if (real) return real;
  const pads: PadSpec[] = [];
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const note = (y + 1) * 10 + x + 1;
      if (x === 8 && y === 8) pads.push({ x, y, shape: "logo", region: "other", label: null, note: 99, cc: false, led: "none", rows: 1 });
      else if (y === 8) pads.push({ x, y, shape: "round", region: "top", label: X_TOP[x], note, cc: true, led: "rgb", rows: 1 });
      else if (x === 8) pads.push({ x, y, shape: "round", region: "right", label: X_RIGHT[7 - y], note, cc: true, led: "rgb", rows: 1 });
      else pads.push({ x, y, shape: "pad", region: "grid", label: null, note, cc: false, led: "rgb", rows: 1 });
    }
  }
  return {
    model,
    modelName: MODELS.find((m) => m.model === model)?.name ?? model,
    width: 9,
    height: 9,
    rowWeights: Array(9).fill(1),
    pads,
    limitedColor: model === "LaunchpadLegacy",
    velocitySensitive: model === "LaunchpadX" || model === "LaunchpadProMk2" || model === "LaunchpadProMk3",
  };
}

export const DISCOVERED: DiscoveredLaunchpad[] = [
  {
    model: "LaunchpadX",
    modelName: "Launchpad X",
    input: { index: 0, name: "LPX MIDI" },
    output: { index: 0, name: "LPX MIDI" },
    firmware: "0.2.3.8",
    identifiedBy: "deviceInquiry",
    inquiryReply: "F0 7E 00 06 02 00 20 29 03 01 00 00 00 02 03 08 F7",
    connected: false,
  },
  {
    model: "LaunchpadMiniMk3",
    modelName: "Launchpad Mini MK3",
    input: { index: 1, name: "LPMiniMK3 MIDI" },
    output: { index: 1, name: "LPMiniMK3 MIDI" },
    firmware: null,
    identifiedBy: "portName",
    inquiryReply: null,
    connected: false,
  },
];

// ----- pages -------------------------------------------------------------------

const rgb = (r: number, g: number, b: number): PadColor => ({ mode: "rgb", r, g, b });
export const C = {
  red: rgb(255, 48, 48),
  orange: rgb(255, 122, 26),
  amber: rgb(255, 196, 40),
  green: rgb(46, 214, 110),
  teal: rgb(0, 196, 186),
  blue: rgb(48, 118, 255),
  violet: rgb(146, 84, 255),
  pink: rgb(255, 72, 168),
  white: rgb(226, 226, 236),
  dim: rgb(70, 70, 86),
};

export function button(caption: string, color: PadColor, extra: Partial<Button> = {}): Button {
  const light = color.mode === "rgb" && 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b > 170;
  return {
    look: { type: "text", caption, size: 15, face: "sans", color: light ? "#15151b" : "#ffffff" },
    color,
    activeColor: null,
    loop: false,
    down: [],
    up: [],
    hold: [],
    holdMs: 500,
    holdWait: true,
    stateLink: null,
    description: "",
    ...extra,
  };
}

const at = (x: number, y: number, b: Button): PlacedButton => ({ ...b, x, y });

let seq = 0;
const id = () => `fx-${++seq}`;

const scene = (name: string, caption: string, color: PadColor) =>
  button(caption, color, {
    activeColor: rgb(255, 255, 255),
    stateLink: { provider: "obs", kind: "scene", scene: name, source: "" },
    down: [{ id: id(), wait: true, type: "obsSwitchScene", scene: name, collection: "" }],
  });

const sound = (file: string, caption: string, color: PadColor) =>
  button(caption, color, {
    down: [{ id: id(), wait: true, type: "playSound", file: `C:\\Users\\Demo\\Sounds\\${file}`, volume: 1, start: 0, end: 1, outputDevice: null, volumeFromVelocity: true }],
  });

const volumeFader: Fader = {
  id: "fader-volume",
  name: "volume",
  variable: "",
  x: 7,
  y: 0,
  direction: "up",
  length: 5,
  colorA: [0, 96, 255],
  colorB: [255, 64, 32],
  dim: 12,
  min: 0,
  max: 100,
  unit: "%",
  decimals: 0,
  value: 75,
  display: null,
  onChange: [{ id: id(), wait: true, type: "setSystemVolume", target: "output", mode: "set", volume: 50, volumeFrom: "value" }],
  onTouch: [],
  onRelease: [],
};

export function demoProfile(): Profile {
  return {
    version: 1,
    activePage: "default",
    pages: [
      {
        id: "default",
        name: "Stream",
        faders: [volumeFader],
        buttons: [
          at(0, 7, scene("Starting soon", "Start", C.teal)),
          at(1, 7, scene("Gameplay", "Game", C.green)),
          at(2, 7, scene("Just chatting", "Chat", C.blue)),
          at(3, 7, scene("Be right back", "BRB", C.violet)),
          at(4, 7, scene("Ending", "End", C.pink)),
          at(6, 7, button("Live", { mode: "pulsing", index: 5 })),
          at(7, 7, button("Rec", C.red)),
          at(0, 6, button("Mic", C.red, { activeColor: C.dim, stateLink: { provider: "obs", kind: "sourceMuted", scene: "", source: "Mic/Aux" } })),
          at(1, 6, button("Cam", C.blue)),
          at(2, 6, button("Music", C.green)),
          at(6, 6, button("Clip", { mode: "flashing", index: 9, alt: 5 })),
          at(7, 6, button("Replay", C.orange)),
          at(0, 5, sound("airhorn.wav", "Horn", C.amber)),
          at(1, 5, sound("drumroll.mp3", "Drums", C.orange)),
          at(2, 5, {
            ...sound("applause.ogg", "Clap", C.green),
            // Shown as a tooltip over the pad; Markdown, with the shared variables filled in.
            description: "Crowd applause, **4 seconds**.\n\n- Hit it harder to play it louder\n- Held: the long version\n\nPlays on `{{fader.volume}} %` of the speakers.",
          }),
          at(3, 5, sound("boo.wav", "Boo", C.red)),
          at(4, 5, sound("laugh.mp3", "Haha", C.pink)),
          at(5, 5, sound("wow.wav", "Wow", C.teal)),
          at(0, 3, button("Deaths +1", C.white)),
          at(1, 3, button("Deaths −1", C.dim)),
          at(0, 2, button("Lights", C.amber)),
          at(1, 2, button("Hype", C.violet)),
          at(0, 0, button("Stop all", C.red)),
        ],
      },
      {
        id: "sounds",
        name: "Sounds",
        faders: [],
        buttons: [at(0, 7, sound("airhorn.wav", "Horn", C.amber)), at(1, 7, sound("applause.ogg", "Clap", C.green))],
      },
      { id: "scenes", name: "Scenes", faders: [], buttons: [at(0, 7, scene("Gameplay", "Game", C.green))] },
    ],
  };
}

/**
 * A page laid out for a Launchkey: buttons on the pads, the buttons beside them, transport and
 * one key, and a fader on the first knob. The two models put their controls in different cells
 * (see the dumped layouts), so each gets its own placement.
 */
export function launchkeyPage(model: LaunchpadModel): Page {
  const pad = (x: number, y: number, caption: string, color: PadColor) => at(x, y, button(caption, color));
  const mk4 = model === "LaunchkeyMiniMk4";
  // Pads: MK3 runs x 4..11 with the scene buttons at x 12; MK4 runs x 5..12 with ∧ / ∨ at x 4.
  const x0 = mk4 ? 5 : 4;
  const top = (i: number) => x0 + i;
  const knob = mk4 ? { x: 5, y: 7 } : { x: 4, y: 6 };
  const side = mk4 ? [{ x: 4, y: 5 }, { x: 4, y: 3 }] : [{ x: 12, y: 5 }, { x: 12, y: 3 }];
  const play = mk4 ? { x: 2, y: 4 } : { x: 13, y: 2 };
  return {
    id: "default",
    name: "Keys",
    faders: [
      { ...volumeFader, id: "fader-filter", name: "filter", variable: "", ...knob, direction: "up", length: 1, min: 0, max: 100, unit: "%", value: 40 },
      // The modulation strip, with all three of a touch strip's lists in use.
      {
        ...volumeFader,
        id: "fader-mic",
        name: "mic",
        variable: "",
        x: 1,
        y: mk4 ? 7 : 6,
        direction: "up",
        length: 1,
        min: 0,
        max: 100,
        unit: "%",
        value: 0,
        onTouch: [{ id: id(), wait: true, type: "obsSetAudio", scene: "", collection: "", source: "Mic/Aux", muted: false, muteMode: "unmute", volumeDb: 0, volumeFrom: null, volumeUnit: "db", setVolume: false }],
        onChange: [{ id: id(), wait: true, type: "obsSetAudio", scene: "", collection: "", source: "Mic/Aux", muted: false, muteMode: "leave", volumeDb: 0, volumeFrom: "percent", volumeUnit: "percent", setVolume: true }],
        onRelease: [{ id: id(), wait: true, type: "obsSetAudio", scene: "", collection: "", source: "Mic/Aux", muted: true, muteMode: "mute", volumeDb: 0, volumeFrom: null, volumeUnit: "db", setVolume: false }],
      },
    ],
    buttons: [
      pad(top(1), 5, "Start", C.teal),
      pad(top(2), 5, "Game", C.green),
      pad(top(3), 5, "Chat", C.blue),
      pad(top(4), 5, "BRB", C.violet),
      pad(top(5), 5, "End", C.pink),
      pad(top(7), 5, "Live", C.red),
      pad(top(1), 3, "Horn", C.amber),
      pad(top(2), 3, "Drums", C.orange),
      pad(top(3), 3, "Clap", C.green),
      pad(top(4), 3, "Boo", C.red),
      pad(top(7), 3, "Clip", C.orange),
      pad(side[0].x, side[0].y, "Next", C.white),
      pad(side[1].x, side[1].y, "Stop", C.dim),
      pad(play.x, play.y, "▶", C.green),
      pad(0, 0, "Horn", C.amber),
    ],
  };
}

// ----- settings and integrations ------------------------------------------------

export function demoSettings(): Settings {
  return {
    version: 1,
    device: { inputName: "LPX MIDI", outputName: "LPX MIDI", model: "LaunchpadX", firmware: "0.2.3.8", virtual: false },
    autoConnect: true,
    pressFeedback: true,
    pushToTalk: { enabled: true, key: "v", modifiers: [] },
    audio: { outputDevice: null },
    obs: { enabled: true, host: "localhost", port: 4455, password: "", autoConnect: true },
    slobs: { enabled: true, host: "127.0.0.1", port: 28194, token: "", autoConnect: true },
    homeAssistant: { enabled: true, url: "http://homeassistant.local:8123", token: "demo-long-lived-token", ignoreTlsErrors: false },
    window: { stayOnTop: false, minimizeToTray: true, runAtStartup: true, startHidden: false },
    developerMode: false,
    // Only the names live in the settings; the values are in the credential store.
    secrets: ["twitch", "hue_bridge"],
  };
}

export const SCENES = ["Starting soon", "Gameplay", "Just chatting", "Be right back", "Ending"];
export const SOURCES = ["Mic/Aux", "Desktop Audio", "Webcam", "Game capture", "Alerts", "Music"];
export const FILTERS = ["Colour correction", "Background blur", "Noise suppression"];

export function demoObs(connected: boolean): ObsState {
  return {
    connected,
    error: connected ? null : "connection refused",
    collections: connected ? ["Main", "Podcast"] : [],
    currentCollection: connected ? "Main" : null,
    scenes: connected ? SCENES : [],
    currentScene: connected ? "Gameplay" : null,
    inputs: connected ? SOURCES : [],
    visible: connected ? [["Gameplay", "Webcam"], ["Gameplay", "Game capture"]] : [],
    muted: [],
    streaming: connected,
    recording: false,
    replayBuffer: connected,
  };
}

export function demoSlobs(connected: boolean): SlobsState {
  return {
    connected,
    error: connected ? null : "Streamlabs Desktop is not running",
    collections: connected ? ["Main", "Podcast"] : [],
    currentCollection: connected ? "Main" : null,
    scenes: connected ? SCENES : [],
    currentScene: connected ? "Gameplay" : null,
    sources: connected ? SOURCES : [],
    audioSources: connected ? ["Mic/Aux", "Desktop Audio", "Music"] : [],
    visible: connected ? [["Gameplay", "Webcam"]] : [],
    muted: [],
    studioMode: false,
    streaming: connected ? "live" : "offline",
    recording: "offline",
    replayBuffer: connected ? "running" : "offline",
  };
}

const entity = (entityId: string, name: string, state: string): HaEntity => ({ entityId, name, domain: entityId.split(".")[0], state });

export function demoHomeAssistant(connected: boolean): HaState {
  return {
    connected,
    error: connected ? null : "could not connect: connection refused",
    version: connected ? "2026.9.2" : null,
    location: connected ? "Home" : null,
    entities: connected
      ? [
          entity("climate.living_room", "Living room", "heat"),
          entity("cover.office_blind", "Office blind", "open"),
          entity("fan.desk_fan", "Desk fan", "off"),
          entity("light.desk_lamp", "Desk lamp", "on"),
          entity("light.key_light", "Key light", "on"),
          entity("light.shelf", "Shelf LEDs", "off"),
          entity("media_player.living_room_speaker", "Living room speaker", "playing"),
          entity("number.soundbar_bass", "Soundbar bass", "3"),
          entity("scene.stream_start", "Stream start", "2026-09-11T09:58:12+00:00"),
          entity("script.goodnight", "Goodnight", "off"),
          entity("switch.on_air_sign", "On air sign", "off"),
        ]
      : [],
  };
}

export const AUDIO: AudioDevices = {
  default: "Speakers (Realtek(R) Audio)",
  devices: ["Speakers (Realtek(R) Audio)", "Headphones (Arctis 7 Game)", "CABLE Input (VB-Audio Virtual Cable)"],
};
export const INPUTS = ["Microphone (Shure MV7)", "Line In (Realtek(R) Audio)", "Headset Microphone (Arctis 7 Chat)"];

/** Where the demo computer keeps its files, and what HTTP request actions have saved there. */
export const CONFIG_DIR = "C:\\Users\\Demo\\AppData\\Roaming\\com.lunchpad.app";
export const DOWNLOADS: DownloadCacheInfo = { path: `${CONFIG_DIR}\\downloads`, files: 3, bytes: 481_920 };

export const VOICES: VoiceInfo[] = [
  { id: "aria", name: "Microsoft Aria", language: "en-US" },
  { id: "guy", name: "Microsoft Guy", language: "en-US" },
  { id: "sonia", name: "Microsoft Sonia", language: "en-GB" },
  { id: "katja", name: "Microsoft Katja", language: "de-DE" },
];

/** A sound's waveform: quick attack, long tail, some grit. Deterministic. */
export function peaks(buckets: number): number[] {
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: buckets }, (_, i) => {
    const env = i < 6 ? i / 6 : Math.exp(-(i - 6) / (buckets / 3));
    return Math.min(1, env * (0.55 + 0.45 * rand()));
  });
}

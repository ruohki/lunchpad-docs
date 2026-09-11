// Demo data the fake backend serves: a connected Launchpad X, three pages of
// buttons, a fader, OBS and Streamlabs with a few scenes. Keep it believable,
// it is what every screenshot shows.
import type {
  AudioDevices,
  Button,
  DiscoveredLaunchpad,
  Fader,
  HaEntity,
  HaState,
  Layout,
  LaunchpadModel,
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
];

/** The 9 × 9 layout of the X (and, close enough for screenshots, every 8 × 8 model). */
export function layoutFor(model: LaunchpadModel): Layout {
  const pads: PadSpec[] = [];
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const note = (y + 1) * 10 + x + 1;
      if (x === 8 && y === 8) pads.push({ x, y, shape: "logo", region: "other", label: null, note: 99, cc: false });
      else if (y === 8) pads.push({ x, y, shape: "round", region: "top", label: X_TOP[x], note, cc: true });
      else if (x === 8) pads.push({ x, y, shape: "round", region: "right", label: X_RIGHT[7 - y], note, cc: true });
      else pads.push({ x, y, shape: "pad", region: "grid", label: null, note, cc: false });
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
          at(2, 5, sound("applause.ogg", "Clap", C.green)),
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

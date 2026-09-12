// One screenshot per entry in the app's "Add action" menu, saved as
// src/assets/screenshots/actions/<type>.png and shown by <ActionShot type="…">.
//
// A new action needs one line here: `shot("myType", [act({ … })])`. The action
// sits in the "When pressed" list of the button at column 1, row 8; the first
// action (or the ones in `open`) is unfolded, then the list is captured.
import type { Locator, Page } from "playwright";
import type { Action, ActionKind, Button } from "@app/lib/api";
import { openActionsTab, openEditor, settle, TALL, type Shot } from "../shot.ts";

let seq = 0;
/** An action with an id and Wait on, like the app creates it. */
const act = (kind: ActionKind, wait = true): Action => ({ id: `shot-${++seq}`, wait, ...kind }) as Action;

interface Options {
  /** rows of the list to unfold (default: the first) */
  open?: number[];
  /** capture the whole Actions tab instead of the pressed list */
  wholeTab?: boolean;
  /** more button fields (released list, loop, …) */
  button?: Partial<Button>;
  /** extra steps before the capture, e.g. clicking "Send test" */
  then?: (page: Page, dialog: Locator) => Promise<void>;
  scenario?: Shot["scenario"];
}

function shot(type: string, actions: Action[], o: Options = {}): Shot {
  return {
    name: `actions/${type}`,
    viewport: TALL,
    margin: 14,
    scenario: { ...o.scenario, focus: { down: actions, ...o.button } },
    run: async (page) => {
      await openEditor(page);
      const dialog = await openActionsTab(page);
      const pressed = dialog.locator("section").first();
      const rows = pressed.locator(":scope > ul > li");
      for (const i of o.open ?? [0]) {
        const toggle = rows.nth(i).locator("button[aria-expanded]").first();
        if (await toggle.count()) await toggle.click();
      }
      await settle(page, 700);
      if (o.then) {
        await o.then(page, dialog);
        await settle(page, 500);
      }
      return o.wholeTab ? pressed.locator("xpath=..") : pressed;
    },
  };
}

const sound = (file: string, extra: Partial<Extract<ActionKind, { type: "playSound" }>> = {}) =>
  act({ type: "playSound", file: `C:\\Users\\Demo\\Sounds\\${file}`, volume: 1, start: 0, end: 1, outputDevice: null, volumeFromVelocity: false, ...extra });

const markers = <T extends string>(...names: T[]) => Object.fromEntries(names.map((n) => [n, `shot-${n}-${++seq}`])) as Record<T, string>;
const ff = markers("s", "m", "e");
const ptt = markers("s", "e");
const cond = markers("s", "o", "e");

/** OBS and Streamlabs twins share their editor; one shot each. */
function streaming(suffix: string, kind: (type: string) => ActionKind, o: Options = {}): Shot[] {
  return ["obs", "slobs"].map((p) => shot(`${p}${suffix}`, [act(kind(`${p}${suffix}`))], o));
}

export const actionShots: Shot[] = [
  // media
  shot("playSound", [sound("airhorn.wav", { volume: 0.9, start: 0.04, end: 0.72, outputDevice: "Headphones (Arctis 7 Game)", volumeFromVelocity: true })]),
  shot("textToSpeech", [act({ type: "textToSpeech", text: "Welcome to the stream! You are viewer number {{viewers}}.", voice: "aria", volume: 0.8 })]),
  shot("setSystemVolume", [act({ type: "setSystemVolume", target: "output", mode: "set", volume: 35, volumeFrom: null, device: "Headphones (Arctis 7 Game)" })]),
  shot("setAudioDevice", [act({ type: "setAudioDevice", target: "output", device: "Headphones (Arctis 7 Game)" })]),
  shot("stopAllSounds", [act({ type: "stopAllSounds" }), sound("drumroll.mp3")], { open: [] }),

  // general
  shot("delay", [sound("drumroll.mp3"), act({ type: "delay", ms: 1500 }), sound("applause.ogg")], { open: [1] }),
  shot("switchPage", [act({ type: "switchPage", pageId: "sounds" })]),
  shot("runButton", [act({ type: "runButton", target: { pageId: "scenes", x: 0, y: 7 }, trigger: "tap" })]),
  shot("setColor", [act({ type: "setColor", color: { mode: "palette", index: 21 }, target: { pageId: null, x: 1, y: 6 } })]),
  shot("setFader", [act({ type: "setFader", fader: "volume", value: "25", runActions: true })]),

  // flow
  shot("ifStart", [
    { ...act({ type: "ifStart", variable: "deaths", op: "greaterThan", value: "9", elseId: cond.o, endId: cond.e }), id: cond.s },
    act({ type: "textToSpeech", text: "Ten deaths. Time for a break.", voice: null, volume: 1 }),
    { ...act({ type: "ifElse", startId: cond.s, endId: cond.e }), id: cond.o },
    act({ type: "addToVariable", name: "deaths", amount: "1", scope: "global" }),
    { ...act({ type: "ifEnd", startId: cond.s, elseId: cond.o }), id: cond.e },
  ] as Action[]),
  shot(
    "flipFlopStart",
    [
      { ...act({ type: "flipFlopStart", middleId: ff.m, endId: ff.e, isA: true }), id: ff.s },
      act({ type: "setSystemVolume", target: "input", mode: "mute", volume: 0, volumeFrom: null }),
      act({ type: "setColor", color: { mode: "palette", index: 5 }, target: null }),
      { ...act({ type: "flipFlopMiddle", startId: ff.s, endId: ff.e }), id: ff.m },
      act({ type: "setSystemVolume", target: "input", mode: "unmute", volume: 0, volumeFrom: null }),
      act({ type: "setColor", color: { mode: "palette", index: 21 }, target: null }),
      { ...act({ type: "flipFlopEnd", startId: ff.s, middleId: ff.m }), id: ff.e },
    ] as Action[],
    { open: [] },
  ),
  shot(
    "pushToTalkStart",
    [
      { ...act({ type: "pushToTalkStart", endId: ptt.e }), id: ptt.s },
      sound("announcement.wav"),
      { ...act({ type: "pushToTalkEnd", startId: ptt.s }), id: ptt.e },
    ] as Action[],
    { open: [] },
  ),

  // system
  shot("hotkey", [
    act({
      type: "hotkey",
      keystrokes: [
        { type: "key", event: "tap", key: "m", modifiers: ["control", "shift"] },
        { type: "delay", ms: 150 },
        { type: "text", text: "gg wp!", delayMs: 25 },
      ],
      restoreAllAtEnd: true,
    }),
  ]),
  shot("launchApplication", [
    act({ type: "launchApplication", executable: "powershell.exe", arguments: '-File "C:\\Scripts\\lights.ps1" {{velocity}}', hidden: true, killOnStop: true, saveOutputTo: "lightsResult", saveScope: "local" }),
  ]),
  shot(
    "httpRequest",
    [
      act({
        type: "httpRequest",
        method: "post",
        url: "https://api.example.com/lights/{{x}}/{{y}}",
        headers: [{ name: "X-Api-Key", value: "{{apiKey}}" }],
        contentType: "application/json",
        body: '{\n  "on": true,\n  "brightness": {{velocity}}\n}',
        bodyMode: "text",
        bodyFile: null,
        files: [],
        auth: { type: "none" },
        timeoutMs: 10000,
        ignoreTlsErrors: false,
        saveTo: "lights",
        saveScope: "local",
      }),
    ],
    { then: async (_page, dialog) => dialog.getByRole("button", { name: "Send test" }).click() },
  ),
  shot(
    "runScript",
    [
      act({
        type: "runScript",
        code: "const deaths = Number(globals.deaths ?? 0) + 1\nglobals.deaths = deaths\nreturn deaths >= 10 ? 'Time for a break' : `Death #${deaths}`",
        saveTo: "message",
        saveScope: "local",
      }),
    ],
    { then: async (_page, dialog) => dialog.getByRole("button", { name: "Run test" }).click(), scenario: { scriptResult: "Death #4" } },
  ),
  shot("setVariable", [act({ type: "setVariable", name: "lastPress", value: "{{x}},{{y}} on {{pageId}}", scope: "global" })]),
  shot("addToVariable", [act({ type: "addToVariable", name: "deaths", amount: "1", scope: "global" })]),

  // stop
  shot("stopThisMacro", [sound("siren.wav")], { open: [], wholeTab: true, button: { loop: true, up: [act({ type: "stopThisMacro" })] } }),
  shot("restartThisMacro", [act({ type: "restartThisMacro" }), sound("drumroll.mp3")], { open: [] }),
  // Nothing after it would run: the macro stops itself too.
  shot("stopAllMacros", [act({ type: "stopAllMacros" })], { open: [] }),

  // OBS Studio and Streamlabs Desktop
  ...streaming("SwitchScene", (type) => ({ type, scene: "Be right back", collection: "" }) as ActionKind),
  ...streaming("ToggleSource", (type) => ({ type, scene: "Gameplay", collection: "", source: "Webcam", visible: true, mode: "toggle" }) as ActionKind),
  ...streaming("SetAudio", (type) => ({ type, scene: "", collection: "", source: "Mic/Aux", muted: false, muteMode: "toggle", volumeDb: -6, volumeFrom: null, volumeUnit: "db", setVolume: true }) as ActionKind),
  ...streaming("ToggleFilter", (type) => ({ type, source: "Webcam", filter: "Background blur", enabled: true }) as ActionKind),
  ...streaming("Stream", (type) => ({ type, target: "replay", mode: "toggle" }) as ActionKind),
  ...["obs", "slobs"].map((p) => shot(`${p}SaveReplay`, [act({ type: `${p}SaveReplay` } as ActionKind), sound("clip.wav")], { open: [] })),
  ...streaming("StudioMode", (type) => ({ type, mode: "transition" }) as ActionKind),

  // Home Assistant (entities come from mock/fixtures.ts)
  shot("homeAssistantTurn", [act({ type: "homeAssistantTurn", entity: "light.desk_lamp", mode: "toggle" })]),
  shot("homeAssistantSetValue", [act({ type: "homeAssistantSetValue", entity: "light.key_light", kind: "brightness", value: 70, valueFrom: null })]),
  shot("homeAssistantCallService", [
    act({ type: "homeAssistantCallService", domain: "light", service: "turn_on", entity: "light.shelf", data: '{ "rgb_color": [255, 122, 26], "transition": 1.5 }' }),
  ]),
];

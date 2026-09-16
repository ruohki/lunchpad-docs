// Typed access to src/data/actions.json (written by `npm run actions:sync` from the app).
import data from '../data/actions.json';

export interface ActionInfo {
	name: string;
	desc: string;
	group: string;
	icon: string;
	menu: boolean;
	wait: boolean;
	partOf?: string;
}

/** One field of an action's JSON, as the engine reads it. */
export interface FieldInfo {
	name: string;
	/** "text", "number", "true or false", or the name of an entry in `types` */
	type: string;
	/** null is allowed */
	nullable?: boolean;
	/** a list of `type` */
	list?: boolean;
	/** may be left out: the engine fills in a default */
	optional?: boolean;
	doc?: string;
}
export interface PayloadInfo {
	doc?: string;
	fields: FieldInfo[];
}
export interface TypeInfo {
	kind: 'enum' | 'object' | 'union';
	doc?: string;
	values?: { value: string; doc?: string; default?: boolean }[];
	fields?: FieldInfo[];
	tag?: string;
	variants?: { value: string; doc?: string; default?: boolean; fields: FieldInfo[] }[];
}

export const groups = data.groups;
export const actions = data.actions as Record<string, ActionInfo>;
export const icons = data.icons as Record<string, { viewBox: string; body: string }>;
/** The JSON each action is, for `Lunchpad.run()` — generated from the app's action model. */
export const payloads = data.payloads as Record<string, PayloadInfo>;
/** The types those payloads refer to (`ButtonRef`, `PadColor`, the string enums …). */
export const types = data.types as Record<string, TypeInfo>;

export function payload(type: string): PayloadInfo {
	const info = payloads[type];
	if (!info) throw new Error(`No JSON payload for action "${type}". Run "npm run actions:sync" after the app gained or renamed actions.`);
	return info;
}

/** Whether a field's type is one of the generated `types` rather than a primitive. */
export const isTypeRef = (field: FieldInfo) => field.type in types;

export function action(type: string): ActionInfo {
	const info = actions[type];
	if (!info) throw new Error(`Unknown action type "${type}". Is it spelled like in the app? Run "npm run actions:sync" after the app gained or renamed actions.`);
	return info;
}

export const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;

/** Pad colour per menu group, LED-bright like the app, with a readable icon colour. */
const GROUP_COLOURS: Record<string, { pad: string; ink: string }> = {
	media: { pad: '#ffc428', ink: '#15151b' },
	general: { pad: '#3076ff', ink: '#ffffff' },
	flow: { pad: '#9254ff', ink: '#ffffff' },
	system: { pad: '#00c4ba', ink: '#0b0b0f' },
	stop: { pad: '#ff3030', ink: '#ffffff' },
	obs: { pad: '#e2e2ec', ink: '#15151b' },
	slobs: { pad: '#3fd8a6', ink: '#0b0b0f' },
	homeAssistant: { pad: '#41bdf5', ink: '#0b0b0f' },
};

export const groupColour = (id: string) => GROUP_COLOURS[id] ?? { pad: '#ff7a1a', ink: '#0b0b0f' };

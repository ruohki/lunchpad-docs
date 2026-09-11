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

export const groups = data.groups;
export const actions = data.actions as Record<string, ActionInfo>;
export const icons = data.icons as Record<string, { viewBox: string; body: string }>;

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

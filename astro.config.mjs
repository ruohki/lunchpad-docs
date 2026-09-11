// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

/** A sidebar group listing every page of a content folder, ordered by `sidebar.order`. */
const folder = (label, directory) => ({ label, items: [{ autogenerate: { directory } }] });

// https://astro.build/config
export default defineConfig({
	// The public address; canonical links and the sitemap use it. SITE_URL overrides it (previews).
	site: process.env.SITE_URL || 'https://docs.lunchp.ad',
	integrations: [
		starlight({
			title: 'Lunchpad',
			description: 'Turn a Novation Launchpad into a macro controller: sounds, hotkeys, OBS and Streamlabs, web requests and scripts on every pad.',
			logo: { src: './src/assets/lunchpad-icon.png', alt: 'Lunchpad' },
			favicon: '/favicon.png',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ruohki/lunchpad' },
				{ icon: 'discord', label: 'Discord', href: 'https://discord.gg/4Ys9TRR' },
			],
			customCss: ['@fontsource-variable/inter', '@fontsource-variable/jetbrains-mono', './src/styles/lunchpad.css'],
			// Keeps the hero screenshot whole and sharp (Starlight crops it to a square).
			components: { Hero: './src/components/Hero.astro' },
			sidebar: [
				folder('Getting started', 'getting-started'),
				folder('Guides', 'guides'),
				{
					label: 'Actions',
					// Grouped like the "Add action" menu in the app. A new page in one of
					// these folders shows up on its own; see CONTRIBUTING.md.
					items: [
						{ label: 'Overview', slug: 'actions' },
						folder('Media', 'actions/media'),
						folder('General', 'actions/general'),
						folder('Flow', 'actions/flow'),
						folder('System', 'actions/system'),
						folder('Stop', 'actions/stop'),
						folder('OBS Studio & Streamlabs', 'actions/streaming'),
						folder('Home Assistant', 'actions/home-assistant'),
					],
				},
				folder('Help', 'help'),
			],
		}),
	],
});

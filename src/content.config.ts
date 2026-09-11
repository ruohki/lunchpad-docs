import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				/**
				 * Action types (ids from the app, e.g. "playSound") this page documents.
				 * `npm run actions:check` compares them with the app; the Actions overview
				 * links each action to the page that lists it.
				 */
				actionTypes: z.array(z.string()).optional(),
			}),
		}),
	}),
};

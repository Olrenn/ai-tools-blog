import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    heroAlt: z.string().optional(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    toolName: z.string(),
    toolUrl: z.string().url(),
    rating: z.number().min(1).max(5),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };

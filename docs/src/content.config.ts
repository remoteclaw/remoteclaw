import { extname } from "node:path";
import { docsSchema } from "@astrojs/starlight/schema";
import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: ".",
      pattern: ["**/[^_]*.{md,mdx}", "!node_modules/**", "!.tmp/**"],
      generateId({ entry }) {
        return entry.replace(extname(entry), "");
      },
    }),
    schema: docsSchema(),
  }),
};

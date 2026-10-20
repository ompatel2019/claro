import { build, type BuildOptions, type Plugin } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile } from "node:fs/promises";

export async function offlineCss() {
  return (
    await postcss([tailwind()]).process(
      await readFile("src/app/globals.css", "utf8"),
      { from: "src/app/globals.css" },
    )
  ).css;
}

export async function offlineBundle(
  contents: string,
  plugins: Plugin[],
  options: Pick<BuildOptions, "define" | "banner"> = {},
) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    ...options,
    plugins,
  });
  return result.outputFiles[0].text;
}

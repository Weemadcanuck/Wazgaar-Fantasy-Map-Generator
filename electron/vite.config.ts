// Bundles the main process and the preload script into CommonJS, inlining npm dependencies
// so the packaged app carries no node_modules. Types are checked separately by `tsc -p electron`
import { copyFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { fileURLToPath, URL } from "node:url";

const resolve = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

/** The app icon lives next to the compiled main process: the dev dock icon and the About panel read it */
const copyAppIcon = {
  name: "copy-app-icon",
  closeBundle: () => copyFileSync(resolve("../build/icon.png"), resolve("../dist-electron/icon.png"))
};

export default ({ mode }: { mode: string }) => {
  const isPreload = mode === "electron-preload";
  const entryName = isPreload ? "preload" : "main";

  return {
    plugins: isPreload ? [] : [copyAppIcon],
    publicDir: false, // public/ belongs to the renderer build, not to the main process
    build: {
      outDir: resolve("../dist-electron"),
      // Build the main process first, then add the separately bundled preload without clearing it.
      // A sandboxed preload cannot require Vite's shared relative chunks, so it must be a single entry.
      emptyOutDir: !isPreload,
      target: "node22",
      minify: false,
      lib: {
        entry: { [entryName]: resolve(`${entryName}.ts`) },
        formats: ["cjs"],
        fileName: (_format: string, name: string) => `${name}.js`
      },
      rollupOptions: {
        external: ["electron", ...builtinModules, ...builtinModules.map(name => `node:${name}`)]
      }
    },
    resolve: { conditions: ["node"] }
  };
};

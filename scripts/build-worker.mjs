/**
 * esbuild script to bundle model-worker.js using local transformers.js source
 * with sourcemaps enabled for debugging.
 *
 * Node.js built-in modules (fs, path, url, stream, etc.) are stubbed out
 * since this bundle runs in a browser web worker only.
 */
import { build } from "esbuild";

// Modules to replace with empty stubs (browser doesn't have these)
const WEB_IGNORE_MODULES = [
  "onnxruntime-node",
  "sharp",
  "fs",
  "path",
  "url",
  "stream",
  "stream/promises",
];

/** Replaces ignored modules with an empty stub */
const ignoreModulesPlugin = (modules = []) => ({
  name: "ignore-modules",
  setup(build) {
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedModules = modules.map(escapeRegex);
    // Match both "module" and "node:module" patterns
    const patterns = escapedModules.flatMap((mod) => [mod, `node:${mod}`]);
    const filter = new RegExp(`^(${patterns.join("|")})$`);

    build.onResolve({ filter }, (args) => ({
      path: args.path,
      namespace: "ignore-modules",
    }));
    build.onLoad({ filter: /.*/, namespace: "ignore-modules" }, () => ({
      contents: `
        const noop = () => {};
        const emptyObj = {};
        export default emptyObj;
        export const Readable = { fromWeb: noop };
        export const pipeline = noop;
        export const createWriteStream = noop;
        export const createReadStream = noop;
      `,
    }));
  },
});

/** Marks any remaining node:* imports as external */
const externalNodeBuiltinsPlugin = () => ({
  name: "external-node-builtins",
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
});

const isDevMode = process.argv.includes("--dev");

await build({
  entryPoints: ["lib/model-worker.js"],
  bundle: true,
  platform: "browser",
  format: "esm",
  outfile: "public/model-worker.bundle.js",
  sourcemap: true, // enables breakpoints in original source files
  treeShaking: true,
  plugins: [
    ignoreModulesPlugin(WEB_IGNORE_MODULES),
    externalNodeBuiltinsPlugin(),
  ],
  logLevel: "info",
  ...(isDevMode ? {} : { minify: false }), // keep readable for debugging
});

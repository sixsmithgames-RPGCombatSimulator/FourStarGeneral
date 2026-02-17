import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }

    // The tests are compiled from TypeScript with extensionless relative imports like
    //   import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
    // Node's ESM resolver requires explicit extensions by default, so retry those imports with ".js".
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
    if (!isRelative || hasExtension) {
      throw error;
    }

    return defaultResolve(`${specifier}.js`, context, defaultResolve);
  }
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".json")) {
    const sourceText = await readFile(fileURLToPath(url), "utf8");
    return {
      format: "module",
      source: `export default ${sourceText};\n`,
      shortCircuit: true
    };
  }

  return defaultLoad(url, context, defaultLoad);
}

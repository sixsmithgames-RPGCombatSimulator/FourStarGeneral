import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "dist");
const staticImportPattern = /(?:\bfrom\s*|\bimport\s*)(["'])(\.\/[^"']+\.js)\1/g;

function findDependencyCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(node) {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      return [...stack.slice(cycleStart), node];
    }
    if (visited.has(node)) {
      return null;
    }

    visiting.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

async function buildStaticImportGraph() {
  const files = (await readdir(outputDirectory)).filter((file) => file.endsWith(".js"));
  if (!files.includes("index.js")) {
    throw new Error("Production bundle is missing dist/index.js.");
  }

  const graph = new Map(files.map((file) => [file, new Set()]));
  for (const file of files) {
    const source = await readFile(path.join(outputDirectory, file), "utf8");
    staticImportPattern.lastIndex = 0;
    for (const match of source.matchAll(staticImportPattern)) {
      const dependency = path.basename(match[2]);
      if (graph.has(dependency)) {
        graph.get(file).add(dependency);
      }
    }
  }
  return graph;
}

const graph = await buildStaticImportGraph();
const cycle = findDependencyCycle(graph);
if (cycle) {
  throw new Error(
    `Production bundle contains a static chunk cycle: ${cycle.join(" -> ")}. `
      + "Static cycles can fail during module initialization in browsers."
  );
}

console.log(`Production bundle verified: ${graph.size} JavaScript file(s), no static chunk cycles.`);

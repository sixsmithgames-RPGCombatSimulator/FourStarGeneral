import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySourceAssetReferences } from "./repository-gate-rules.mjs";

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolsDirectory, "..");
const result = verifySourceAssetReferences(repositoryRoot);

if (result.failures.length > 0) {
  console.error("Source asset verification failed:\n" + result.failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  const summary = Object.entries(result.counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => `${count} ${category}`)
    .join(", ");
  console.log(`Source assets verified: ${result.references.length} explicit reference(s) (${summary}).`);
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildAirScenarioDiagnosticTextFiles, formatAirScenarioSummary, runAirScenario } from "./airScenarioSupport.js";
const args = new Set(process.argv.slice(2));
const result = runAirScenario();
const now = new Date();
const timestamp = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0")
].join("")
    + "-"
    + [
        now.getHours().toString().padStart(2, "0"),
        now.getMinutes().toString().padStart(2, "0"),
        now.getSeconds().toString().padStart(2, "0")
    ].join("");
const outputDir = join(process.cwd(), "diagnostics", "air-scenario");
mkdirSync(outputDir, { recursive: true });
const textPath = join(outputDir, `air-scenario-${timestamp}.txt`);
const jsonPath = join(outputDir, `air-scenario-${timestamp}.json`);
const bundleDir = join(outputDir, `air-scenario-${timestamp}`);
const bundleSummaryPath = join(bundleDir, "summary.txt");
const reportText = [`Generated: ${now.toISOString()}`, "", formatAirScenarioSummary(result)].join("\n");
writeFileSync(textPath, reportText, "utf8");
writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf8");
mkdirSync(bundleDir, { recursive: true });
writeFileSync(bundleSummaryPath, reportText, "utf8");
buildAirScenarioDiagnosticTextFiles(result).forEach((file) => {
    const absolutePath = join(bundleDir, file.relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, file.content, "utf8");
});
if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
}
else {
    console.log(reportText);
}
console.log(`Report file: ${textPath}`);
console.log(`JSON file: ${jsonPath}`);
console.log(`Bundle dir: ${bundleDir}`);
if ((args.has("--fail-on-anomalies") || args.has("--fail-on-findings"))
    && (result.findings.length > 0 || result.legacyDiagnosticFindings.length > 0)) {
    process.exitCode = 1;
}
if (args.has("--fail-on-anomalies") && result.anomalies.length > 0) {
    process.exitCode = 1;
}

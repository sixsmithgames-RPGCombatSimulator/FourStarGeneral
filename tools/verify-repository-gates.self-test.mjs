import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectNamedFunctionDeclarations,
  collectNamedTypeDeclarations,
  collectUiEngineImports,
  collectRuntimeStaticImports,
  compareGrandfatheredUiEngineImports,
  verifySourceAssetReferences
} from "./repository-gate-rules.mjs";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fsg-repository-gates-"));

function writeFixture(relativePath, contents = "fixture") {
  const absolutePath = path.join(fixtureRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
}

function createArchitectureFixtures() {
  writeFixture("src/ui/Allowed.ts", 'import type { GameEngine } from "../../game/GameEngine";\n');
  writeFixture("src/ui/Panel.tsx", 'export { GameEngine } from "../../game/GameEngineInitiativeExtensions";\n');
  writeFixture("src/ui/Barrel.ts", 'export * from "../../game/GameEngine";\n');
  writeFixture("src/ui/Legacy.ts", 'import Engine = require("../../game/GameEngineLegacy");\nvoid Engine;\n');
  writeFixture(
    "src/ui/Dynamic.ts",
    'void import("../../game/GameEngineRuntime");\nvoid import(`../../game/GameEngineLazy`);\n'
  );
  writeFixture("src/ui/Computed.ts", 'const modulePath = "../../game/GameEngineHidden";\nvoid import(modulePath);\n');
}

function testArchitectureRules() {
  createArchitectureFixtures();
  const actual = collectUiEngineImports(path.join(fixtureRoot, "src", "ui"), fixtureRoot);
  const expected = new Set([
    "src/ui/Allowed.ts\u0000../../game/GameEngine",
    "src/ui/Barrel.ts\u0000../../game/GameEngine",
    "src/ui/Dynamic.ts\u0000../../game/GameEngineLazy",
    "src/ui/Dynamic.ts\u0000../../game/GameEngineRuntime",
    "src/ui/Legacy.ts\u0000../../game/GameEngineLegacy",
    "src/ui/Panel.tsx\u0000../../game/GameEngineInitiativeExtensions"
  ]);
  assert.deepEqual([...actual].sort(), [...expected].sort(), "UI scanner must catch TSX, re-export, and literal dynamic-import bypasses");

  const allowedPair = new Set(["src/ui/Allowed.ts\u0000../../game/GameEngine"]);
  assert.deepEqual(
    compareGrandfatheredUiEngineImports(allowedPair, allowedPair),
    [],
    "an exact grandfathered file/module pair must remain allowed"
  );
  const changedModule = new Set(["src/ui/Allowed.ts\u0000../../game/GameEngineRuntime"]);
  const pairFailures = compareGrandfatheredUiEngineImports(changedModule, allowedPair);
  assert.equal(pairFailures.length, 2, "changing either side of a grandfathered pair must create new and stale-baseline failures");

  const runtimeImports = collectRuntimeStaticImports([
    'import { BattleScreen } from "./BattleScreen";',
    'import type { PrecombatScreen } from "./PrecombatScreen";',
    'import { type TacticalBattleFlow } from "./TacticalBattleFlow";',
    'void import("./LazyBattleRuntime");'
  ].join("\n"), "src/main.ts");
  assert.deepEqual(
    [...runtimeImports],
    ["./BattleScreen"],
    "startup import policy must ignore erased type imports and intentional dynamic imports"
  );

  writeFixture("src/contracts/Canonical.ts", "export interface SharedEvent { readonly id: string; }\nexport type SharedStatus = 'ready';\n");
  const canonicalNames = new Set(["SharedEvent", "SharedStatus"]);
  let declarations = collectNamedTypeDeclarations(path.join(fixtureRoot, "src"), fixtureRoot, canonicalNames);
  assert.deepEqual(declarations.get("SharedEvent"), ["src/contracts/Canonical.ts"]);
  assert.deepEqual(declarations.get("SharedStatus"), ["src/contracts/Canonical.ts"]);

  writeFixture("src/ui/Duplicate.ts", "interface SharedEvent { readonly duplicate: true; }\n");
  declarations = collectNamedTypeDeclarations(path.join(fixtureRoot, "src"), fixtureRoot, canonicalNames);
  assert.deepEqual(
    declarations.get("SharedEvent"),
    ["src/contracts/Canonical.ts", "src/ui/Duplicate.ts"],
    "canonical ownership scanning must expose duplicate declarations anywhere under src"
  );

  writeFixture("src/domain/CanonicalRuntime.ts", "export function projectCanonicalState() { return 'ready'; }\n");
  const canonicalFunctions = new Set(["projectCanonicalState"]);
  let functions = collectNamedFunctionDeclarations(path.join(fixtureRoot, "src"), fixtureRoot, canonicalFunctions);
  assert.deepEqual(functions.get("projectCanonicalState"), ["src/domain/CanonicalRuntime.ts"]);

  writeFixture("src/ui/DuplicateRuntime.ts", "function projectCanonicalState() { return 'duplicate'; }\n");
  functions = collectNamedFunctionDeclarations(path.join(fixtureRoot, "src"), fixtureRoot, canonicalFunctions);
  assert.deepEqual(
    functions.get("projectCanonicalState"),
    ["src/domain/CanonicalRuntime.ts", "src/ui/DuplicateRuntime.ts"],
    "canonical runtime ownership scanning must expose duplicate declarations anywhere under src"
  );
}

function createAssetFixtures() {
  writeFixture("src/data/unitSpriteCatalog.ts", [
    'unitSprite("static.png");',
    'directionalSprite("tank");',
    'factionDirectionalSprites({ Player: "infantry", Bot: "enemy" });',
    'factionStaticSprites({ Player: "plane.png" });'
  ].join("\n"));
  writeFixture("src/data/unitSystem/formations.ts", 'sprite("formation.png");\n');
  writeFixture("src/main.ts", 'const rendererOptions = { effects: "data/effects.json" };\n');
  writeFixture("public/data/effects.json", "[]\n");

  for (const fileName of ["static.png", "plane.png", "formation.png"]) {
    writeFixture(`src/assets/units/${fileName}`);
  }
  for (const baseName of ["tank", "infantry", "enemy"]) {
    for (const suffix of ["Southview", "Sideview", "Northview"]) {
      writeFixture(`src/assets/units/${baseName}_${suffix}.png`);
    }
  }

  const catalog = JSON.stringify({
    version: "fixture",
    assets: {
      fire: { id: "fire", filePath: "sounds/combat/fire.mp3" }
    }
  });
  writeFixture("src/data/soundCatalog.json", catalog);
  writeFixture("public/data/soundCatalog.json", catalog);
  writeFixture("public/sounds/combat/fire.mp3");
}

function testAssetRules() {
  createAssetFixtures();
  const passing = verifySourceAssetReferences(fixtureRoot);
  assert.deepEqual(passing.failures, [], `complete fixture should pass:\n${passing.failures.join("\n")}`);

  fs.appendFileSync(
    path.join(fixtureRoot, "src", "data", "unitSpriteCatalog.ts"),
    "\nunitSprite(spriteName);\n"
  );
  const dynamicBypass = verifySourceAssetReferences(fixtureRoot);
  assert.ok(
    dynamicBypass.failures.some((failure) => failure.includes("expression the asset gate cannot verify")),
    "non-literal sprite catalog additions must fail closed"
  );

  createAssetFixtures();
  fs.rmSync(path.join(fixtureRoot, "src", "assets", "units", "tank_Northview.png"));
  const missingDirection = verifySourceAssetReferences(fixtureRoot);
  assert.ok(
    missingDirection.failures.some((failure) => failure.includes("tank_Northview.png")),
    "directional sprite families must validate every runtime-facing variant"
  );

  writeFixture("src/assets/units/tank_Northview.png");
  fs.rmSync(path.join(fixtureRoot, "public", "sounds", "combat", "fire.mp3"));
  const missingAudio = verifySourceAssetReferences(fixtureRoot);
  assert.ok(
    missingAudio.failures.some((failure) => failure.includes("public/sounds/combat/fire.mp3")),
    "sound catalog filePath entries must resolve to public audio files"
  );

  writeFixture("public/sounds/combat/fire.mp3");
  fs.rmSync(path.join(fixtureRoot, "public", "data", "effects.json"));
  const missingRuntimeJson = verifySourceAssetReferences(fixtureRoot);
  assert.ok(
    missingRuntimeJson.failures.some((failure) => failure.includes("public/data/effects.json")),
    "root-relative runtime JSON references must resolve under public"
  );
}

try {
  testArchitectureRules();
  testAssetRules();
  console.log("Repository gate self-tests passed: UI/startup import bypasses, canonical type/runtime ownership, and dynamic/public asset references are enforced.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

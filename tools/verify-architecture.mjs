import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  collectNamedFunctionDeclarations,
  collectNamedTypeDeclarations,
  collectUiEngineImports,
  collectRuntimeStaticImports,
  compareGrandfatheredUiEngineImports
} from "./repository-gate-rules.mjs";

const toolsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(toolsDirectory, "..");
const baselinePath = path.join(toolsDirectory, "architecture-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const failures = [];
const tacticalLazyImportPolicy = {
  "src/main.ts": new Set([
    "./state/BattleState",
    "./ui/screens/PrecombatScreen",
    "./ui/screens/BattleScreen",
    "./ui/components/PopupManager",
    "./ui/components/WarRoomOverlay",
    "./ui/components/DeploymentPanel",
    "./ui/components/SidebarButtons",
    "./ui/components/BattleWarRoomDataProvider",
    "./ui/components/TutorialOverlay",
    "./ui/announcements/BattleActivityLog",
    "./ui/controls/MapViewport",
    "./ui/controls/ZoomPanControls",
    "./rendering/HexMapRenderer",
    "./bootstrap/TacticalBattleFlowBootstrap"
  ]),
  "src/ui/screens/LandingScreen.ts": new Set([
    "./PrecombatScreen",
    "../../bootstrap/TacticalBattleFlowBootstrap"
  ])
};

function readRepositoryFile(relativePath) {
  const absolutePath = path.join(repositoryRoot, ...relativePath.split("/"));
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Architecture target is missing: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function countLines(source) {
  return source.split(/\r?\n/).length;
}

for (const [relativePath, forbiddenModules] of Object.entries(tacticalLazyImportPolicy)) {
  const imports = collectRuntimeStaticImports(readRepositoryFile(relativePath), relativePath);
  for (const modulePath of imports) {
    if (forbiddenModules.has(modulePath)) {
      failures.push(`${relativePath} eagerly imports tactical runtime module ${modulePath}. Route it through the lazy TacticalBattleFlow boundary.`);
    }
  }
}

function collectMethodLineCounts(relativePath) {
  const source = readRepositoryFile(relativePath);
  if (!source) return new Map();
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methods = new Map();
  const recordFunction = (name, declaration) => {
    if (!declaration.body) return;
    const start = sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
    const end = sourceFile.getLineAndCharacterOfPosition(declaration.end).line + 1;
    methods.set(name, end - start + 1);
  };
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      recordFunction(`<module>.${statement.name.text}`, statement);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          recordFunction(`<module>.${declaration.name.text}`, declaration.initializer);
        }
      }
      continue;
    }
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    for (const member of statement.members) {
      const isMethod = ts.isMethodDeclaration(member)
        || ts.isConstructorDeclaration(member)
        || ts.isGetAccessorDeclaration(member)
        || ts.isSetAccessorDeclaration(member);
      if (isMethod && member.body) {
        const memberName = ts.isConstructorDeclaration(member) ? "constructor" : member.name?.getText(sourceFile);
        if (memberName) recordFunction(`${statement.name.text}.${memberName}`, member);
        continue;
      }
      if (ts.isPropertyDeclaration(member) && member.name && member.initializer
        && (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))) {
        recordFunction(`${statement.name.text}.${member.name.getText(sourceFile)}`, member.initializer);
      }
    }
  }
  return methods;
}

for (const [relativePath, maximum] of Object.entries(baseline.lineBudgets)) {
  const actual = countLines(readRepositoryFile(relativePath));
  if (actual > maximum) {
    failures.push(`${relativePath} grew to ${actual} lines; architecture budget is ${maximum}. Extract a capability before adding more.`);
  } else if (actual < maximum) {
    failures.push(`${relativePath} shrank to ${actual} lines; lower its architecture budget from ${maximum} so the improvement cannot regress.`);
  }
}

for (const budget of baseline.symbolBudgets) {
  const source = readRepositoryFile(budget.file);
  const expression = new RegExp(budget.pattern, "g");
  const actual = source.match(expression)?.length ?? 0;
  if (actual > budget.maximum) {
    failures.push(`${budget.file} has ${actual} ${budget.description} call(s); architecture budget is ${budget.maximum}. Route the new path through state.`);
  }
}

for (const contract of baseline.canonicalDeclarationOwners ?? []) {
  const governedNames = new Set(contract.names);
  const declarations = collectNamedTypeDeclarations(path.join(repositoryRoot, "src"), repositoryRoot, governedNames);
  for (const name of governedNames) {
    const owners = declarations.get(name) ?? [];
    if (owners.length !== 1 || owners[0] !== contract.owner) {
      failures.push(`${name} must be declared exactly once by ${contract.owner}; found ${owners.length === 0 ? "no declaration" : owners.join(", ")}.`);
    }
  }
}

for (const contract of baseline.canonicalFunctionOwners ?? []) {
  const governedNames = new Set(contract.names);
  const declarations = collectNamedFunctionDeclarations(path.join(repositoryRoot, "src"), repositoryRoot, governedNames);
  for (const name of governedNames) {
    const owners = declarations.get(name) ?? [];
    if (owners.length !== 1 || owners[0] !== contract.owner) {
      failures.push(`${name} must be declared exactly once by ${contract.owner}; found ${owners.length === 0 ? "no declaration" : owners.join(", ")}.`);
    }
  }
}

if (Number.isInteger(baseline.methodLineLimit) && baseline.methodLineLimit > 0) {
  const oversizedBudgets = baseline.oversizedMethodBudgets ?? {};
  const trackedFiles = new Set([
    ...Object.keys(baseline.lineBudgets),
    ...Object.keys(oversizedBudgets)
  ]);
  for (const relativePath of trackedFiles) {
    const actualMethods = collectMethodLineCounts(relativePath);
    const fileBudgets = oversizedBudgets[relativePath] ?? {};
    for (const [methodName, actual] of actualMethods) {
      const maximum = fileBudgets[methodName];
      if (actual > baseline.methodLineLimit && maximum === undefined) {
        failures.push(`${relativePath} introduces oversized method ${methodName} at ${actual} lines; the limit for new methods is ${baseline.methodLineLimit}. Extract cohesive helpers.`);
      } else if (maximum !== undefined && actual > maximum) {
        failures.push(`${relativePath} method ${methodName} grew to ${actual} lines; architecture budget is ${maximum}. Extract behavior before adding more.`);
      } else if (maximum !== undefined && actual < maximum) {
        failures.push(`${relativePath} method ${methodName} shrank to ${actual} lines; lower its architecture budget from ${maximum} so the improvement cannot regress.`);
      }
    }
    for (const [methodName, maximum] of Object.entries(fileBudgets)) {
      const actual = actualMethods.get(methodName);
      if (actual === undefined) {
        failures.push(`${relativePath} no longer contains grandfathered method ${methodName}; remove its ${maximum}-line architecture exemption.`);
      } else if (actual <= baseline.methodLineLimit) {
        failures.push(`${relativePath} method ${methodName} is now ${actual} lines; remove its oversized-method exemption.`);
      }
    }
  }
}

const allowedImports = new Set(
  Object.entries(baseline.allowedUiEngineImports).flatMap(([file, modules]) => (
    modules.map((modulePath) => `${file}\u0000${modulePath}`)
  ))
);
const uiRoot = path.join(repositoryRoot, "src", "ui");
const actualImports = collectUiEngineImports(uiRoot, repositoryRoot);
failures.push(...compareGrandfatheredUiEngineImports(actualImports, allowedImports));

if (failures.length > 0) {
  console.error("Architecture verification failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  const oversizedMethodCount = Object.values(baseline.oversizedMethodBudgets ?? {})
    .reduce((sum, methods) => sum + Object.keys(methods).length, 0);
  console.log(`Architecture verified: ${Object.keys(baseline.lineBudgets).length} file budgets, ${baseline.symbolBudgets.length} coupling budgets, ${(baseline.canonicalDeclarationOwners ?? []).length} canonical type ownership contract, ${(baseline.canonicalFunctionOwners ?? []).length} canonical function ownership contracts, ${oversizedMethodCount} oversized method budgets, ${actualImports.size} grandfathered UI engine imports.`);
}

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);
const DIRECTIONAL_VIEW_SUFFIXES = ["Southview", "Sideview", "Northview"];
const FACTION_FILE_PROPERTIES = new Set(["Player", "Bot", "Ally", "fallback"]);

function toRepositoryPath(repositoryRoot, absolutePath) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
}

function collectFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolutePath, predicate);
    return entry.isFile() && predicate(entry.name) ? [absolutePath] : [];
  });
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function isGameEngineModule(modulePath) {
  return modulePath.includes("/game/GameEngine") || modulePath.startsWith("game/GameEngine");
}

function sourceKindFor(absolutePath) {
  return path.extname(absolutePath).toLowerCase() === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** Finds top-level interface/type declarations for canonical-ownership architecture contracts. */
export function collectNamedTypeDeclarations(sourceRoot, repositoryRoot, governedNames) {
  const declarations = new Map([...governedNames].map((name) => [name, []]));
  const files = collectFiles(sourceRoot, (name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  for (const absolutePath of files) {
    const relativePath = toRepositoryPath(repositoryRoot, absolutePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      sourceKindFor(absolutePath)
    );
    for (const statement of sourceFile.statements) {
      if ((!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement))
        || !governedNames.has(statement.name.text)) continue;
      declarations.get(statement.name.text).push(relativePath);
    }
  }
  return declarations;
}

/** Finds top-level named function declarations for canonical runtime-ownership contracts. */
export function collectNamedFunctionDeclarations(sourceRoot, repositoryRoot, governedNames) {
  const declarations = new Map([...governedNames].map((name) => [name, []]));
  const files = collectFiles(sourceRoot, (name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  for (const absolutePath of files) {
    const relativePath = toRepositoryPath(repositoryRoot, absolutePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      sourceKindFor(absolutePath)
    );
    for (const statement of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(statement)
        || !statement.name
        || !governedNames.has(statement.name.text)) continue;
      declarations.get(statement.name.text).push(relativePath);
    }
  }
  return declarations;
}

export function collectUiEngineImports(uiRoot, repositoryRoot) {
  const imports = new Set();
  const files = collectFiles(uiRoot, (name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  for (const absolutePath of files) {
    const relativePath = toRepositoryPath(repositoryRoot, absolutePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    const sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      sourceKindFor(absolutePath)
    );
    const recordModule = (node) => {
      const modulePath = literalText(node);
      if (modulePath && isGameEngineModule(modulePath)) {
        imports.add(`${relativePath}\u0000${modulePath}`);
      }
    };
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        recordModule(node.moduleSpecifier);
      } else if (ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression) {
        recordModule(node.moduleReference.expression);
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        recordModule(node.moduleSpecifier);
      } else if (ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length >= 1) {
        recordModule(node.arguments[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return imports;
}

/** Returns only static imports that survive TypeScript erasure and can affect startup bundling. */
export function collectRuntimeStaticImports(source, relativePath = "source.ts") {
  const imports = new Set();
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourceKindFor(relativePath)
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const modulePath = literalText(statement.moduleSpecifier);
    if (!modulePath) continue;
    const clause = statement.importClause;
    if (!clause) {
      imports.add(modulePath);
      continue;
    }
    if (clause.isTypeOnly) continue;
    if (clause.name) {
      imports.add(modulePath);
      continue;
    }
    const bindings = clause.namedBindings;
    if (!bindings || ts.isNamespaceImport(bindings)
      || bindings.elements.some((element) => !element.isTypeOnly)) {
      imports.add(modulePath);
    }
  }
  return imports;
}

export function compareGrandfatheredUiEngineImports(actualImports, allowedImports) {
  const failures = [];
  for (const actualImport of actualImports) {
    if (!allowedImports.has(actualImport)) {
      const [file, modulePath] = actualImport.split("\u0000");
      failures.push(`New UI-to-engine import: ${file} -> ${modulePath}. Add a typed state or contract boundary instead.`);
    }
  }
  for (const allowedImport of allowedImports) {
    if (!actualImports.has(allowedImport)) {
      const [file, modulePath] = allowedImport.split("\u0000");
      failures.push(`Removed UI-to-engine import is still grandfathered: ${file} -> ${modulePath}. Delete it from the architecture baseline so the coupling cannot return.`);
    }
  }
  return failures;
}

function containingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name)) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

function nodeLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isFilesPropertyExpression(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.expression)
      && node.expression.text === "files"
      && FACTION_FILE_PROPERTIES.has(node.name.text);
  }
  return ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    && isFilesPropertyExpression(node.left)
    && isFilesPropertyExpression(node.right);
}

function isContainedPath(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function createAssetRecorder(repositoryRoot, failures, references) {
  return (sourcePath, reference, assetPath, category, allowedRoot = repositoryRoot) => {
    const sourceLabel = toRepositoryPath(repositoryRoot, sourcePath);
    const assetLabel = toRepositoryPath(repositoryRoot, assetPath);
    references.push({ source: sourceLabel, reference, asset: assetLabel, category });
    if (!isContainedPath(allowedRoot, assetPath)) {
      failures.push(`${sourceLabel} has unsafe ${category} path ${reference}`);
    } else if (!fs.existsSync(assetPath)) {
      failures.push(`${sourceLabel} references missing ${category} ${assetLabel}`);
    }
  };
}

function validateStaticImportMetaUrls(repositoryRoot, sourceRoot, recordAsset) {
  const files = collectFiles(sourceRoot, (name) => SOURCE_EXTENSIONS.has(path.extname(name)));
  for (const sourcePath of files) {
    const source = fs.readFileSync(sourcePath, "utf8");
    const sourceFile = ts.createSourceFile(
      toRepositoryPath(repositoryRoot, sourcePath),
      source,
      ts.ScriptTarget.Latest,
      true,
      sourceKindFor(sourcePath)
    );
    const visit = (node) => {
      if (ts.isNewExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "URL"
        && node.arguments?.length === 2) {
        const reference = literalText(node.arguments[0]);
        const base = node.arguments[1].getText(sourceFile).replace(/\s/g, "");
        if (reference?.startsWith(".") && base === "import.meta.url") {
          recordAsset(sourcePath, reference, path.resolve(path.dirname(sourcePath), reference), "import-meta asset");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

function validateFactionFileObject({
  argument,
  call,
  directional,
  sourceFile,
  sourcePath,
  unitAssetRoot,
  repositoryRoot,
  recordAsset,
  failures
}) {
  const sourceLabel = toRepositoryPath(repositoryRoot, sourcePath);
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    failures.push(`${sourceLabel}:${nodeLine(sourceFile, call)} uses a non-literal faction sprite map that the asset gate cannot verify.`);
    return;
  }
  let hasPlayer = false;
  for (const property of argument.properties) {
    if (!ts.isPropertyAssignment(property)) {
      failures.push(`${sourceLabel}:${nodeLine(sourceFile, property)} uses an unsupported faction sprite property.`);
      continue;
    }
    const propertyName = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      ? property.name.text
      : null;
    const fileName = literalText(property.initializer);
    if (!propertyName || !FACTION_FILE_PROPERTIES.has(propertyName) || !fileName) {
      failures.push(`${sourceLabel}:${nodeLine(sourceFile, property)} must use a supported faction key with a literal sprite filename.`);
      continue;
    }
    hasPlayer ||= propertyName === "Player";
    const names = directional
      ? DIRECTIONAL_VIEW_SUFFIXES.map((suffix) => `${fileName}_${suffix}.png`)
      : [fileName];
    for (const name of names) {
      recordAsset(sourcePath, name, path.resolve(unitAssetRoot, name), "unit sprite", unitAssetRoot);
    }
  }
  if (!hasPlayer) {
    failures.push(`${sourceLabel}:${nodeLine(sourceFile, call)} faction sprite map must declare a literal Player asset.`);
  }
}

function validateUnitSpriteCatalog(repositoryRoot, recordAsset, failures) {
  const sourcePath = path.join(repositoryRoot, "src", "data", "unitSpriteCatalog.ts");
  const unitAssetRoot = path.join(repositoryRoot, "src", "assets", "units");
  if (!fs.existsSync(sourcePath)) {
    failures.push("Required unit sprite catalog is missing: src/data/unitSpriteCatalog.ts");
    return;
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile("src/data/unitSpriteCatalog.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const failDynamic = (call, callee) => {
    failures.push(`src/data/unitSpriteCatalog.ts:${nodeLine(sourceFile, call)} calls ${callee} with an expression the asset gate cannot verify.`);
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const argument = node.arguments[0];
      const reference = argument ? literalText(argument) : null;
      const owner = containingFunctionName(node);
      if (callee === "unitSprite") {
        if (reference) {
          recordAsset(sourcePath, reference, path.resolve(unitAssetRoot, reference), "unit sprite", unitAssetRoot);
        } else if (owner === "directionalSprite") {
          const supportedTemplate = argument && ts.isTemplateExpression(argument)
            && argument.head.text === ""
            && argument.templateSpans.length === 1
            && ts.isIdentifier(argument.templateSpans[0].expression)
            && argument.templateSpans[0].expression.text === "baseFileName"
            && argument.templateSpans[0].literal.text === "_Southview.png";
          if (!supportedTemplate) failDynamic(node, callee);
        } else if (owner === "factionStaticSprites") {
          if (!argument || !isFilesPropertyExpression(argument)) failDynamic(node, callee);
        } else if (owner === "resolveDirectionalSprite") {
          if (!argument || !ts.isIdentifier(argument) || argument.text !== "resolvedFileName") {
            failDynamic(node, callee);
          }
        } else {
          failDynamic(node, callee);
        }
      } else if (callee === "directionalSprite") {
        if (reference) {
          for (const suffix of DIRECTIONAL_VIEW_SUFFIXES) {
            const fileName = `${reference}_${suffix}.png`;
            recordAsset(sourcePath, fileName, path.resolve(unitAssetRoot, fileName), "directional unit sprite", unitAssetRoot);
          }
        } else if (owner === "factionDirectionalSprites") {
          if (!argument || !isFilesPropertyExpression(argument)) failDynamic(node, callee);
        } else {
          failDynamic(node, callee);
        }
      } else if (callee === "factionDirectionalSprites" || callee === "factionStaticSprites") {
        validateFactionFileObject({
          argument,
          call: node,
          directional: callee === "factionDirectionalSprites",
          sourceFile,
          sourcePath,
          unitAssetRoot,
          repositoryRoot,
          recordAsset,
          failures
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function validateFormationSprites(repositoryRoot, recordAsset, failures) {
  const sourcePath = path.join(repositoryRoot, "src", "data", "unitSystem", "formations.ts");
  const unitAssetRoot = path.join(repositoryRoot, "src", "assets", "units");
  if (!fs.existsSync(sourcePath)) {
    failures.push("Required formation catalog is missing: src/data/unitSystem/formations.ts");
    return;
  }
  const source = fs.readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile("src/data/unitSystem/formations.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "sprite") {
      const reference = node.arguments[0] ? literalText(node.arguments[0]) : null;
      if (!reference) {
        failures.push(`src/data/unitSystem/formations.ts:${nodeLine(sourceFile, node)} calls sprite with an expression the asset gate cannot verify.`);
      } else {
        recordAsset(sourcePath, reference, path.resolve(unitAssetRoot, reference), "formation sprite", unitAssetRoot);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function validateRuntimePublicReferences(repositoryRoot, sourceRoot, recordAsset) {
  const publicRoot = path.join(repositoryRoot, "public");
  const publicReferencePattern = /^\/?(?:data\/[^?#]+\.json|sounds\/[^?#]+\.(?:mp3|wav|ogg))$/i;
  const files = collectFiles(sourceRoot, (name) => SOURCE_EXTENSIONS.has(path.extname(name)));
  for (const sourcePath of files) {
    const source = fs.readFileSync(sourcePath, "utf8");
    const sourceFile = ts.createSourceFile(
      toRepositoryPath(repositoryRoot, sourcePath),
      source,
      ts.ScriptTarget.Latest,
      true,
      sourceKindFor(sourcePath)
    );
    const visit = (node) => {
      const reference = literalText(node);
      if (reference && publicReferencePattern.test(reference)) {
        const normalized = reference.replace(/^\//, "");
        const allowedRoot = normalized.startsWith("data/")
          ? path.join(publicRoot, "data")
          : path.join(publicRoot, "sounds");
        recordAsset(sourcePath, reference, path.resolve(publicRoot, normalized), "public runtime asset", allowedRoot);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

function validateSoundCatalog(repositoryRoot, relativePath, recordAsset, failures) {
  const catalogPath = path.join(repositoryRoot, ...relativePath.split("/"));
  if (!fs.existsSync(catalogPath)) {
    failures.push(`Required sound catalog is missing: ${relativePath}`);
    return;
  }
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (error) {
    failures.push(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!catalog || typeof catalog !== "object" || !catalog.assets || typeof catalog.assets !== "object") {
    failures.push(`${relativePath} must contain an assets object.`);
    return;
  }
  for (const [assetId, metadata] of Object.entries(catalog.assets)) {
    const reference = metadata && typeof metadata === "object" ? metadata.filePath : null;
    if (typeof reference !== "string" || !/^sounds\/[^?#]+\.(?:mp3|wav|ogg)$/i.test(reference)) {
      failures.push(`${relativePath} sound ${assetId} must declare a local public audio filePath.`);
      continue;
    }
    const publicRoot = path.join(repositoryRoot, "public");
    recordAsset(
      catalogPath,
      reference,
      path.resolve(publicRoot, reference),
      "sound asset",
      path.join(publicRoot, "sounds")
    );
  }
}

export function verifySourceAssetReferences(repositoryRoot) {
  const failures = [];
  const references = [];
  const recordAsset = createAssetRecorder(repositoryRoot, failures, references);
  const sourceRoot = path.join(repositoryRoot, "src");
  validateStaticImportMetaUrls(repositoryRoot, sourceRoot, recordAsset);
  validateUnitSpriteCatalog(repositoryRoot, recordAsset, failures);
  validateFormationSprites(repositoryRoot, recordAsset, failures);
  validateRuntimePublicReferences(repositoryRoot, sourceRoot, recordAsset);
  validateSoundCatalog(repositoryRoot, "src/data/soundCatalog.json", recordAsset, failures);
  validateSoundCatalog(repositoryRoot, "public/data/soundCatalog.json", recordAsset, failures);
  return {
    failures,
    references,
    counts: references.reduce((counts, reference) => {
      counts[reference.category] = (counts[reference.category] ?? 0) + 1;
      return counts;
    }, {})
  };
}

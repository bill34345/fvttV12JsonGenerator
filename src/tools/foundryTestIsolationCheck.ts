import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

export interface FoundryTestIsolationFinding {
  file: string;
  line: number;
  importedName: string;
}

const TEST_ROOTS = [
  'tools/foundry-ops/src',
  'scripts/foundry-lab/__tests__',
] as const;

export function findUnsafeCreateLabConfigCalls(
  sourceText: string,
  fileName = 'fixture.test.ts',
): FoundryTestIsolationFinding[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const directImports = new Set<string>();
  const hermeticImports = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings) continue;
    if (!ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === 'createLabConfig') directImports.add(element.name.text);
      if (importedName === 'createHermeticLabConfig') hermeticImports.add(element.name.text);
    }
  }

  const findings: FoundryTestIsolationFinding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const importedName = node.expression.text;
      const environment = node.arguments[1];
      const inheritsProcessEnvironment = Boolean(
        environment
        && ts.isPropertyAccessExpression(environment)
        && ts.isIdentifier(environment.expression)
        && environment.expression.text === 'process'
        && environment.name.text === 'env',
      );
      const unsafeProductionCall = directImports.has(importedName)
        && (node.arguments.length < 2 || inheritsProcessEnvironment);
      const unsafeHermeticOverride = hermeticImports.has(importedName) && inheritsProcessEnvironment;
      if (!unsafeProductionCall && !unsafeHermeticOverride) {
        ts.forEachChild(node, visit);
        return;
      }
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push({
        file: fileName,
        line: location.line + 1,
        importedName,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

export async function scanFoundryTestIsolation(
  workspaceRoot = process.cwd(),
): Promise<FoundryTestIsolationFinding[]> {
  const files: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && path.endsWith('.test.ts')) files.push(path);
    }
  };
  for (const testRoot of TEST_ROOTS) await walk(join(workspaceRoot, testRoot));

  const findings: FoundryTestIsolationFinding[] = [];
  for (const file of files.sort()) {
    const relativeFile = relative(workspaceRoot, file).replaceAll('\\', '/');
    findings.push(...findUnsafeCreateLabConfigCalls(await readFile(file, 'utf8'), relativeFile));
  }
  return findings;
}

if (import.meta.main) {
  const findings = await scanFoundryTestIsolation();
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.line}: ${finding.importedName} must receive an explicit environment`);
    }
    process.exitCode = 1;
  } else {
    console.log('Foundry 测试隔离检查通过：没有直接配置调用隐式继承进程环境。');
  }
}

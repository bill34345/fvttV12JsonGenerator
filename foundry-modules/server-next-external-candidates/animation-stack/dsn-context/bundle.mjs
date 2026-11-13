import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dsnContextUpstream, disposalStatement, patchDsnContextLifecycle, releaseStatement } from './context-lifecycle.mjs';

export function buildDsnContextBundle(bundle, sourceMapText) {
  assertHash(bundle, dsnContextUpstream.bundleSha256, 'official main.js');
  assertHash(sourceMapText, dsnContextUpstream.sourceMapSha256, 'official main.js.map');
  const sourceMap = JSON.parse(sourceMapText);
  const sourceIndex = sourceMap.sources.indexOf(dsnContextUpstream.sourcePath);
  if (sourceMap.version !== 3 || sourceIndex < 0) throw new Error('Expected locked Dice3D source in the official map');
  const source = sourceMap.sourcesContent[sourceIndex];
  const patchedSource = patchDsnContextLifecycle(source);
  const originalDisposalLine = source.split('\n').findIndex(line => line === disposalStatement) + 1;
  const insertedSourceLine = originalDisposalLine + 1;

  // Build the generated delta from the validated source statement, leaving unrelated release code untouched.
  const generatedDisposal = disposalStatement.trim().slice(0, -1);
  const insertion = `,${releaseStatement.trim().slice(0, -1)}`;
  const offset = bundle.indexOf(generatedDisposal) + generatedDisposal.length;
  if (bundle.split(generatedDisposal).length !== 2 || bundle[offset] !== ',') {
    throw new Error('Expected the sole generated board disposal in a comma-expression chain');
  }
  const generatedStart = positionAt(bundle, offset);
  const candidate = bundle.slice(0, offset) + insertion + bundle.slice(offset);
  const { SourceMapConsumer, SourceMapGenerator } = createRequire(import.meta.resolve('handlebars'))('source-map');
  const consumer = new SourceMapConsumer(sourceMap);
  const anchor = consumer.originalPositionFor(generatedStart);
  if (anchor.source !== dsnContextUpstream.sourcePath || anchor.line !== originalDisposalLine) {
    throw new Error('Generated disposal is not mapped to the pinned source disposal');
  }
  const generator = new SourceMapGenerator({ file: sourceMap.file, sourceRoot: sourceMap.sourceRoot });
  let preservedMappings = 0;
  consumer.eachMapping(mapping => {
    const generated = {
      line: mapping.generatedLine,
      column: mapping.generatedColumn + Number(mapping.generatedLine === generatedStart.line && mapping.generatedColumn >= generatedStart.column) * insertion.length
    };
    if (mapping.source === null || mapping.originalLine === null) {
      generator.addMapping({ generated });
      return;
    }
    const original = {
      line: mapping.originalLine + Number(mapping.source === dsnContextUpstream.sourcePath && mapping.originalLine >= insertedSourceLine),
      column: mapping.originalColumn
    };
    generator.addMapping({ generated, original, source: mapping.source, ...(mapping.name ? { name: mapping.name } : {}) });
    preservedMappings++;
  });
  generator.addMapping({ generated: generatedStart });
  generator.addMapping({
    generated: { line: generatedStart.line, column: generatedStart.column + 1 },
    original: { line: insertedSourceLine, column: releaseStatement.length - releaseStatement.trimStart().length },
    source: dsnContextUpstream.sourcePath
  });
  generator.addMapping({
    generated: { line: generatedStart.line, column: generatedStart.column + insertion.length },
    original: { line: anchor.line, column: anchor.column },
    source: anchor.source,
    ...(anchor.name ? { name: anchor.name } : {})
  });
  for (let index = 0; index < sourceMap.sources.length; index++) {
    generator.setSourceContent(sourceMap.sources[index], index === sourceIndex ? patchedSource : sourceMap.sourcesContent[index]);
  }
  const candidateMap = generator.toJSON();
  const verified = new SourceMapConsumer(candidateMap);
  const insertedMapping = verified.originalPositionFor({ line: generatedStart.line, column: generatedStart.column + 1 });
  if (insertedMapping.source !== dsnContextUpstream.sourcePath || insertedMapping.line !== insertedSourceLine) {
    throw new Error('Generated context release lacks its correct source mapping');
  }
  consumer.destroy?.();
  verified.destroy?.();
  return {
    bundle: candidate,
    sourceMap: candidateMap,
    source: patchedSource,
    adaptation: {
      sourceSha256: digest(patchedSource),
      originalSourceSha256: digest(source),
      generatedInsertion: generatedStart,
      originalDisposalLine,
      insertedSourceLine,
      preservedMappings,
      runtime: 'release only the replaced DSN board renderer context after its existing dispose call',
      buildMode: 'pinned-source-driven generated delta with adjusted original/generated mappings; not a full upstream Rollup rebuild',
      otherSourceContentsUnchanged: sourceMap.sources.every((name, index) => name === dsnContextUpstream.sourcePath || candidateMap.sourcesContent[candidateMap.sources.indexOf(name)] === sourceMap.sourcesContent[index])
    }
  };
}

function positionAt(text, offset) {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1).length };
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function assertHash(value, expected, label) {
  if (digest(value) !== expected) throw new Error(`${label} does not match the pinned release`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { bundle, sourceMapText } = JSON.parse(text);
  process.stdout.write(JSON.stringify(buildDsnContextBundle(bundle, sourceMapText)));
}

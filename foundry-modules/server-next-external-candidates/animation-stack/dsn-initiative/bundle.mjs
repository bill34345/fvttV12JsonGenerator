import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildDsnContextBundle } from '../dsn-context/bundle.mjs';
import { dsnInitiativeUpstream, flagMethod, flagRedraw, patchInitiativeMask, pendingField } from './initiative-mask.mjs';

export function buildDsnInitiativeBundle(bundle, sourceMapText) {
  const context = buildDsnContextBundle(bundle, sourceMapText);
  const sourceMap = context.sourceMap;
  const sourceIndex = sourceMap.sources.indexOf(dsnInitiativeUpstream.sourcePath);
  if (sourceIndex < 0) throw new Error('Missing locked InitiativeMask source');
  const source = sourceMap.sourcesContent[sourceIndex];
  const patchedSource = patchInitiativeMask(source);
  const classStart = context.bundle.indexOf('class InitiativeMask{');
  const fieldStart = context.bundle.indexOf('static _renderTimer=null;', classStart) + 'static _renderTimer=null;'.length;
  const methodStart = context.bundle.indexOf('static flag(i){', fieldStart);
  const methodEnd = context.bundle.indexOf('static release(i){', methodStart);
  if (classStart < 0 || fieldStart <= classStart || methodStart < fieldStart || methodEnd < methodStart) {
    throw new Error('Expected the pinned InitiativeMask generated class');
  }
  const edits = [
    { start: fieldStart, end: fieldStart, text: pendingField.trim(), sourceStart: patchedSource.indexOf(pendingField) + 4 },
    { start: methodStart, end: methodEnd, text: flagMethod(patchedSource), sourceStart: patchedSource.indexOf('static flag(') }
  ];
  const { SourceMapConsumer, SourceMapGenerator } = createRequire(import.meta.resolve('handlebars'))('source-map');
  const consumer = new SourceMapConsumer(sourceMap);
  const oldGeneratedLines = lineStarts(context.bundle);
  const originalFlagLine = source.slice(0, source.indexOf('static flag(')).split('\n').length;
  if (consumer.originalPositionFor(positionAt(oldGeneratedLines, methodStart)).source !== dsnInitiativeUpstream.sourcePath
    || consumer.originalPositionFor(positionAt(oldGeneratedLines, methodStart)).line !== originalFlagLine) {
    throw new Error('Generated flag method is not mapped to the pinned InitiativeMask source');
  }
  let candidate = context.bundle;
  for (const edit of edits.toReversed()) candidate = candidate.slice(0, edit.start) + edit.text + candidate.slice(edit.end);
  const candidateLines = lineStarts(candidate);
  const patchedSourceLines = lineStarts(patchedSource);
  const sourceFieldLine = source.slice(0, source.indexOf('    static _renderTimer = null;')).split('\n').length;
  const sourceRedrawLine = source.slice(0, source.indexOf('        ui.combat?.render();', source.indexOf('static flag('))).split('\n').length;
  const generator = new SourceMapGenerator({ file: sourceMap.file, sourceRoot: sourceMap.sourceRoot });
  let preservedMappings = 0;
  let replacedMappings = 0;
  consumer.eachMapping(mapping => {
    const oldOffset = oldGeneratedLines[mapping.generatedLine - 1] + mapping.generatedColumn;
    if (oldOffset >= methodStart && oldOffset < methodEnd) { replacedMappings++; return; }
    const generated = positionAt(candidateLines, shiftedOffset(oldOffset, edits));
    if (mapping.source === null || mapping.originalLine === null) { generator.addMapping({ generated }); return; }
    let line = mapping.originalLine;
    if (mapping.source === dsnInitiativeUpstream.sourcePath) {
      line += Number(mapping.originalLine > sourceFieldLine);
      line += Number(mapping.originalLine > sourceRedrawLine) * (flagRedraw.split('\n').length - 1);
    }
    generator.addMapping({ generated, original: { line, column: mapping.originalColumn }, source: mapping.source,
      ...(mapping.name ? { name: mapping.name } : {}) });
    preservedMappings++;
  });
  let addedMappings = 0;
  for (const edit of edits) {
    const generatedStart = shiftedOffset(edit.start, edits.filter(other => other !== edit));
    for (let index = 0; index < edit.text.length; index++) {
      if (edit.text[index] === '\n') continue;
      generator.addMapping({ generated: positionAt(candidateLines, generatedStart + index),
        original: positionAt(patchedSourceLines, edit.sourceStart + index), source: dsnInitiativeUpstream.sourcePath });
      addedMappings++;
    }
  }
  for (let index = 0; index < sourceMap.sources.length; index++) {
    generator.setSourceContent(sourceMap.sources[index], index === sourceIndex ? patchedSource : sourceMap.sourcesContent[index]);
  }
  const candidateMap = generator.toJSON();
  const verified = new SourceMapConsumer(candidateMap);
  for (const edit of edits) {
    const generatedStart = shiftedOffset(edit.start, edits.filter(other => other !== edit));
    const expected = positionAt(patchedSourceLines, edit.sourceStart);
    const actual = verified.originalPositionFor(positionAt(candidateLines, generatedStart));
    if (actual.source !== dsnInitiativeUpstream.sourcePath || actual.line !== expected.line || actual.column !== expected.column) {
      throw new Error('Generated initiative change lacks its correct source mapping');
    }
  }
  consumer.destroy?.();
  verified.destroy?.();
  return {
    bundle: candidate, sourceMap: candidateMap, source: patchedSource, contextSource: context.source,
    adaptation: {
      context: context.adaptation, sourcePath: dsnInitiativeUpstream.sourcePath,
      originalSourceSha256: dsnInitiativeUpstream.sourceSha256, sourceSha256: digest(patchedSource),
      generatedEdits: edits.map(({ start, end, text }) => ({ start, end, insertedLength: text.length })),
      preservedMappings, replacedMappings, addedMappings,
      runtime: 'coalesce only synchronous initiative-mask flag redraws into one microtask before paint; preserve the native release timer',
      buildMode: 'locked-source method insertion with identity mappings, composed after the existing context-release delta; not a full upstream rebuild',
      otherSourceContentsUnchanged: sourceMap.sources.every((name, index) => name === dsnInitiativeUpstream.sourcePath
        || candidateMap.sourcesContent[candidateMap.sources.indexOf(name)] === sourceMap.sourcesContent[index])
    }
  };
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function shiftedOffset(offset, edits) {
  return offset + edits.reduce((shift, edit) => shift + (offset >= edit.end ? edit.text.length - (edit.end - edit.start) : 0), 0);
}
function lineStarts(text) {
  const result = [0];
  for (let index = 0; index < text.length; index++) if (text[index] === '\n') result.push(index + 1);
  return result;
}
function positionAt(starts, offset) {
  let low = 0, high = starts.length;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid;
  }
  return { line: low + 1, column: offset - starts[low] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { bundle, sourceMapText } = JSON.parse(input);
  process.stdout.write(JSON.stringify(buildDsnInitiativeBundle(bundle, sourceMapText)));
}

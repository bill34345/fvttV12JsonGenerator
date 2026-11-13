import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDsnInitiativeBundle } from './dsn-initiative/bundle.mjs';

const sourcePath = '../module/engine/DiceFactory.js';
const bundleHash = '5d0b607dc74767bb109a42c32f9ba417216ed224fdf3d9bda1347482d8626bd4';
const mapHash = 'b7b4c2da341d6ee9af96875afa36635bc2c067ddfa7ba630a97c64dd7fbcfaa3';
const workerName = 'bump-normal-worker.js';

const materialMethods = `createMaterial(...args) {
		const material = this.#buildMaterial(...args);
		const bump = material.next();
		return bump.done ? bump.value : material.next(this.heightCanvasToNormalCanvas(bump.value)).value;
	}

	async #createBoardMaterial(...args) {
		const material = this.#buildMaterial(...args, true);
		let bump = material.next();
		while (!bump.done && bump.value.context) {
			const { context, x, y } = bump.value;
			// Canvas batches drawing until readback. Flush this group before painting the next faces.
			context.getImageData(x, y, 1, 1);
			await (globalThis.scheduler?.yield?.() ?? new Promise(resolve => setTimeout(resolve, 0)));
			bump = material.next();
		}
		if (bump.done) return bump.value;
		const normal = await buildBoardNormalCanvas(bump.value, this.normalMapStrength)
			.catch(() => this.heightCanvasToNormalCanvas(bump.value));
		return material.next(normal).value;
	}

	*#buildMaterial(`;

const normalClient = `
async function buildBoardNormalCanvas(bump, strength) {
	const bitmap = await createImageBitmap(bump);
	let worker;
	try {
		worker = new Worker(new URL('./${workerName}', import.meta.url));
		const pixels = await new Promise((resolve, reject) => {
			worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.pixels);
			worker.onerror = reject;
			worker.onmessageerror = reject;
			worker.postMessage({ bitmap, strength }, [bitmap]);
		});
		const normal = document.createElement('canvas');
		normal.width = bump.width;
		normal.height = bump.height;
		normal.getContext('2d').putImageData(new ImageData(pixels, bump.width, bump.height), 0, 0);
		return normal;
	} finally {
		bitmap.close();
		worker?.terminate();
	}
}
`;

export function buildBoardNormalCandidate(bundle, mapText) {
	if (digest(bundle) !== bundleHash || digest(mapText) !== mapHash) {
		throw new Error('Expected the locked Dice So Nice 6.4.4+local.2 main.js and source map');
	}
	const map = JSON.parse(mapText);
	const index = map.sources.indexOf(sourcePath);
	const source = map.sourcesContent[index];
	const edits = [
		['export class DiceFactory {', 'class DiceFactory{', [normalClient + 'export class DiceFactory {', normalClient + 'class DiceFactory{']],
		[
			'material = this.createMaterial(scopedTextureCache, baseMaterialCacheString, diceobj, materialData);',
			'g=this.createMaterial(i,_,p,b),',
			[
				'material = this.realisticLighting && scopedTextureCache.type === "board"\n'
					+ '\t\t\t\t\t? await this.#createBoardMaterial(scopedTextureCache, baseMaterialCacheString, diceobj, materialData)\n'
					+ '\t\t\t\t\t: this.createMaterial(scopedTextureCache, baseMaterialCacheString, diceobj, materialData);',
				'g=this.realisticLighting&&i.type==="board"?await this.#createBoardMaterial(i,_,p,b):this.createMaterial(i,_,p,b),'
			]
		],
		['createMaterial(scopedTextureCache, baseMaterialCacheString, diceobj, materialData) {', 'createMaterial(i,r,o,c){',
			[materialMethods + 'scopedTextureCache, baseMaterialCacheString, diceobj, materialData, slicePaint = false) {',
				materialMethods + 'i,r,o,c,slicePaint=false){']],
		[
			'let contextBump = canvasBump.getContext("2d", {alpha: true});',
			'C=E.getContext("2d",{alpha:!0});C.globalAlpha=0;',
			[
				'let contextBump = canvasBump.getContext("2d", slicePaint ? {alpha: true, willReadFrequently: false} : {alpha: true});',
				'C=E.getContext("2d",slicePaint?{alpha:!0,willReadFrequently:!1}:{alpha:!0});C.globalAlpha=0;'
			]
		],
		['let shapeFace = 0; // 1-based shape face counter', 'W=0;const j=d.length-o.values.length;',
			['let shapeFace = 0; // 1-based shape face counter\n\t\tlet facesSinceFlush = 0;', 'W=0,facesSinceFlush=0;const j=d.length-o.values.length;']],
		[
			'x += sizeTexture;\n\t\t}\n\n\t\t//inherited shapes',
			'V+=B}if(L){let i=2;',
			[
				'x += sizeTexture;\n\t\t\tif (slicePaint && ++facesSinceFlush % 3 === 0) yield { context: contextBump, x: x - sizeTexture, y };'
					+ '\n\t\t}\n\n\t\t//inherited shapes',
				'V+=B;if(slicePaint&&++facesSinceFlush%3===0)yield{context:C,x:V-B,y:G}}if(L){let i=2;'
			]
		],
		[
			'x += sizeTexture;\n\t\t\t}\n\t\t}\n\n\n\t\t//var img',
			'V+=B}}if(!this.baseMaterialCache[r])',
			[
				'x += sizeTexture;\n\t\t\t\tif (slicePaint && ++facesSinceFlush % 3 === 0) yield { context: contextBump, x: x - sizeTexture, y };'
					+ '\n\t\t\t}\n\t\t}\n\n\n\t\t//var img',
				'V+=B;if(slicePaint&&++facesSinceFlush%3===0)yield{context:C,x:V-B,y:G}}}if(!this.baseMaterialCache[r])'
			]
		],
		['this.heightCanvasToNormalCanvas(canvasBump)', 'this.heightCanvasToNormalCanvas(E)', ['yield canvasBump', 'yield E']]
	];
	const sourceEdits = edits.map(([anchor, , replacements]) => locate(source, anchor, replacements[0]));
	const bundleEdits = edits.map(([, anchor, replacements]) => locate(bundle, anchor, replacements[1]));
	const patchedSource = applyEdits(source, sourceEdits);
	const patchedBundle = applyEdits(bundle, bundleEdits);
	return {
		bundle: patchedBundle,
		map: mapEdits(map, source, bundle, patchedSource, patchedBundle, sourceEdits, bundleEdits, index),
		worker: buildWorker(source)
	};
}

export function buildBoardNormalFromOfficial(bundle, mapText) {
	const base = buildDsnInitiativeBundle(bundle, mapText);
	return buildBoardNormalCandidate(base.bundle, JSON.stringify(base.sourceMap) + '\n');
}

function buildWorker(source) {
	const methodStart = source.indexOf('heightCanvasToNormalCanvas(srcCanvas, strength');
	const methodEnd = source.indexOf('\n\t//Stripped version', methodStart);
	const method = source.slice(methodStart, methodEnd);
	const math = locate(method, '\t\t//read the red channel as height', '').start;
	const output = locate(method, '\t\tconst dstCanvas = document.createElement("canvas");', '').start;
	const sobel = locate(method, '\t\tconst sample = (x, y) => {', '').start;
	const write = locate(method, '\t\tdstCtx.putImageData(dstImage, 0, 0);', '').start;
	return `// Pixel conversion derived from the locked DiceFactory.js heightCanvasToNormalCanvas.
self.onmessage = ({ data: { bitmap, strength } }) => {
	try {
		const { width: w, height: h } = bitmap;
		const context = new OffscreenCanvas(w, h).getContext('2d');
		context.drawImage(bitmap, 0, 0);
		const srcData = context.getImageData(0, 0, w, h).data;
${method.slice(math, output)}		const out = new Uint8ClampedArray(w * h * 4);
${method.slice(sobel, write)}		self.postMessage({ pixels: out }, [out.buffer]);
	} catch (error) {
		self.postMessage({ error: String(error) });
	} finally {
		bitmap.close();
	}
};
`;
}

function mapEdits(map, source, bundle, patchedSource, patchedBundle, sourceEdits, bundleEdits, sourceIndex) {
	const { SourceMapConsumer, SourceMapGenerator } = createRequire(import.meta.resolve('handlebars'))('source-map');
	const consumer = new SourceMapConsumer(map);
	const generator = new SourceMapGenerator({ file: map.file });
	const oldSourceLines = lineStarts(source);
	const oldBundleLines = lineStarts(bundle);
	const newSourceLines = lineStarts(patchedSource);
	const newBundleLines = lineStarts(patchedBundle);
	for (const [index, edit] of bundleEdits.entries()) {
		const anchor = consumer.originalPositionFor(positionAt(oldBundleLines, edit.start));
		const original = positionAt(oldSourceLines, sourceEdits[index].start);
		if (anchor.source !== sourcePath || anchor.line !== original.line) {
			throw new Error(`Generated DiceFactory anchor does not match source line ${original.line}`);
		}
	}
	consumer.eachMapping(mapping => {
		const bundleOffset = oldBundleLines[mapping.generatedLine - 1] + mapping.generatedColumn;
		const movedBundleOffset = mappedOffset(bundleOffset, bundleEdits);
		if (movedBundleOffset === null) return;
		const generated = positionAt(newBundleLines, movedBundleOffset);
		if (mapping.originalLine === null) {
			generator.addMapping({ generated });
			return;
		}
		let original = { line: mapping.originalLine, column: mapping.originalColumn };
		if (mapping.source === sourcePath) {
			const sourceOffset = oldSourceLines[original.line - 1] + original.column;
			const movedSourceOffset = mappedOffset(sourceOffset, sourceEdits);
			if (movedSourceOffset === null) return;
			original = positionAt(newSourceLines, movedSourceOffset);
		}
		generator.addMapping({ generated, original, source: mapping.source, ...(mapping.name ? { name: mapping.name } : {}) });
	});
	let sourceDelta = 0;
	let bundleDelta = 0;
	for (const [index, edit] of bundleEdits.entries()) {
		const sourceEdit = sourceEdits[index];
		const sourceStart = sourceEdit.start + sourceDelta;
		const bundleStart = edit.start + bundleDelta;
		const replacementLines = lineStarts(edit.replacement);
		for (const offset of replacementLines) {
			const sourceOffset = edit.replacement[offset] === sourceEdit.replacement[offset] ? offset : 0;
			generator.addMapping({ source: sourcePath, generated: positionAt(newBundleLines, bundleStart + offset),
				original: positionAt(newSourceLines, sourceStart + sourceOffset) });
		}
		sourceDelta += sourceEdit.replacement.length - (sourceEdit.end - sourceEdit.start);
		bundleDelta += edit.replacement.length - (edit.end - edit.start);
	}
	for (const [index, name] of map.sources.entries()) {
		generator.setSourceContent(name, index === sourceIndex ? patchedSource : map.sourcesContent[index]);
	}
	consumer.destroy?.();
	return JSON.stringify(generator.toJSON());
}

function locate(text, anchor, replacement) {
	const start = text.indexOf(anchor);
	if (start < 0 || text.indexOf(anchor, start + anchor.length) !== -1) {
		throw new Error(`Expected one DiceFactory anchor: ${anchor}`);
	}
	return { start, end: start + anchor.length, replacement };
}

function applyEdits(text, edits) {
	for (const edit of edits.toReversed()) {
		text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
	}
	return text;
}

function mappedOffset(offset, edits) {
	let delta = 0;
	for (const { start, end, replacement } of edits) {
		if (offset < start) break;
		if (offset < end) return null;
		delta += replacement.length - (end - start);
	}
	return offset + delta;
}

function lineStarts(text) {
	const starts = [0];
	for (let offset = text.indexOf('\n'); offset !== -1; offset = text.indexOf('\n', offset + 1)) starts.push(offset + 1);
	return starts;
}

function positionAt(starts, offset) {
	let low = 0;
	let high = starts.length;
	while (high - low > 1) {
		const mid = (low + high) >> 1;
		if (starts[mid] <= offset) low = mid;
		else high = mid;
	}
	return { line: low + 1, column: offset - starts[low] };
}

function digest(text) {
	return createHash('sha256').update(text).digest('hex');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const [base, output, mode] = process.argv.slice(2);
	if (!base || !output || (mode !== undefined && mode !== '--official')) {
		throw new Error('Usage: node dsn-board-normal-worker.mjs <package directory> <new output directory> [--official]');
	}
	const [bundle, map] = await Promise.all(['main.js', 'main.js.map'].map(file => readFile(join(base, file), 'utf8')));
	const candidate = (mode === '--official' ? buildBoardNormalFromOfficial : buildBoardNormalCandidate)(bundle, map);
	await mkdir(output);
	for (const [name, content] of [['main.js', candidate.bundle], ['main.js.map', candidate.map], [workerName, candidate.worker]]) {
		await writeFile(join(output, name), content, { flag: 'wx' });
	}
}

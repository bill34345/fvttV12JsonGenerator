import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchShouldApplyChange } from './phase-patch.mjs';
import { patchCompendiumStatusReconciliation } from './compendium-status-guard.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const taskRoot = path.join(root, '.local/next-finish-20261002');
const candidate = path.join(taskRoot, 'dae-upstream/package/dae');
const archive = path.join(taskRoot, 'dae-upstream/dae-v14.0.14.zip');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (sha(archive) !== '82118247402d56da085144db0cd96cb6d61a79e2c88a72218111705ce2cc37de') throw new Error('Released archive identity differs');
const script = path.join(candidate, 'module/dae.js');
if (sha(script) !== '140e7714e8bb9f324ec95d9be67e9742907744663fdb40555a89394041294527') throw new Error('Candidate already patched or release source differs');
const source = fs.readFileSync(script, 'utf8');
fs.writeFileSync(script, patchCompendiumStatusReconciliation(patchShouldApplyChange(source)));
const manifestPath = path.join(candidate, 'module.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
if (manifest.id !== 'dae' || manifest.version !== '14.0.14') throw new Error('Released manifest differs');
manifest.version = '14.0.14+servernext.1';
manifest.title = 'Dynamic effects using Active Effects (DAE, ServerNext local)';
delete manifest.manifest; delete manifest.download;
manifest.flags = { ...manifest.flags, serverNextLocal: {
  upstreamVersion: '14.0.14', upstreamArchiveSha256: sha(archive),
  reason: 'Preserve native shouldApplyChange conditions and applied marker after DAE phase routing; skip live status reconciliation for authored compendium Actor templates',
  compendiumSourceGuardRevision: 1,
  scriptSha256: sha(script),
  verifiedTarget: { core: '14.368', dnd5e: '6.0.5' }
} };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const license = path.join(taskRoot, 'dae-upstream/LICENSE');
if (!fs.readFileSync(license, 'utf8').startsWith('MIT License')) throw new Error('Author license missing');
fs.writeFileSync(path.join(candidate, 'LICENSE'), fs.readFileSync(license), { flag: 'wx' });
const changed = ['module/dae.js', 'module.json', 'LICENSE'].map(relative => ({ relative, sha256: sha(path.join(candidate, relative)) }));
const report = { candidate, version: manifest.version, archiveSha256: sha(archive), changed,
  upstreamLicense: 'https://gitlab.com/tposney/dae/-/raw/v14/LICENSE', sharedToolChanges: 0,
  install: 'NOT_EXECUTED', runtime: 'NOT_EXECUTED' };
fs.writeFileSync(path.join(taskRoot, 'dae-candidate-receipt.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report));

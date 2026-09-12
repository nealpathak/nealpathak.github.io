// Runs every self-test in the repository. Usage: node selftest.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const suites = [
  'data/selftest.mjs',
  'engines/loss-run-pipeline/selftest.mjs',
  'engines/loss-development/selftest.mjs',
  'engines/capital-model/selftest.mjs',
  'engines/tcor-allocation/selftest.mjs',
  'engines/contract-requirements/selftest.mjs',
  'renewal/selftest.mjs',
];
let failed = 0;
for (const s of suites) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [join(root, s)], { encoding: 'utf-8' });
  const lines = (r.stdout || '').trim().split('\n');
  const n = lines.filter(l => l.startsWith('  ok')).length;
  const bad = lines.filter(l => l.startsWith('  FAIL'));
  if (r.status !== 0) { failed++; console.log(`✗ ${s}\n${r.stdout}${r.stderr}`); }
  else console.log(`✓ ${s.padEnd(44)} ${String(n).padStart(3)} checks  ${Date.now() - t} ms`);
  for (const b of bad) console.log('   ' + b.trim());
}
if (failed) { console.log(`${failed} suite(s) failed`); process.exit(1); }
console.log('all suites passed');

// Headless verification: loads the game, autopilots it down the canyon and
// checks for shader/runtime errors, gate scoring, saving and persistence.
// Usage:  npx http-server -p 8123 .   then   node tools/check-browser.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Playwright is a dev-only tool and may be installed locally or globally, so
// try the local resolution first and fall back to the global root.
const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* not installed locally */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(root + '/')('playwright');
  } catch { /* fall through to the message below */ }
  console.error('playwright not found. Install it with:  npm i -D playwright');
  process.exit(2);
}
const { chromium } = loadPlaywright();

// Screenshots go in a gitignored folder so a verification run never leaves
// artefacts in the deployed site root.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '.shots');
mkdirSync(SHOTS, { recursive: true });
const shot = (name) => join(SHOTS, name);

const AUTOPILOT = `
const g = window.__slipstream;
g.input.update = function () {
  const ship = g.ship, course = g.course, run = g.run;
  const gate = course.gates[run.nextGate];
  let tx, ty, tz;
  if (gate) { tx = gate.x; ty = gate.y; tz = gate.z; }
  else { tz = ship.z + 80; tx = course.pathX(tz); ty = course.floorY(tz) + 14; }
  const gap = tz - ship.z;
  if (gap > 70) ty = Math.min(ty, course.floorY(ship.z + 40) + 9);
  const dz = Math.max(1, gap);
  let w = Math.atan2(tx - ship.x, dz) - ship.yaw;
  while (w > Math.PI) w -= 6.283185; while (w < -Math.PI) w += 6.283185;
  this.steer = Math.max(-1, Math.min(1, w * 2.6));
  const dp = Math.atan2(ty - ship.y, Math.hypot(tx - ship.x, dz));
  this.pitch = Math.max(-1, Math.min(1, (dp - ship.pitch) * 3.2));
  this.brake = Math.abs(this.steer) > 0.85 ? 1 : 0;
};
`;

const errors = [];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});

async function session(name, url, viewport, shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(`[${name}] ${e}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.click('#btn-start');
  await page.evaluate(AUTOPILOT);
  await page.evaluate(() => { const g = window.__slipstream; g.autoQuality = false; g.renderer.setResolutionScale(1); });
  for (const s of shots) {
    await page.waitForTimeout(s.wait);
    await page.screenshot({ path: s.file });
  }
  const state = await page.evaluate(() => ({
    z: Math.round(window.__slipstream.ship.z),
    speed: document.getElementById('hud-speed').textContent,
    gates: document.getElementById('hud-gates').textContent,
    boost: +window.__slipstream.ship.boostFactor.toFixed(2),
    clearance: +window.__slipstream.ship.clearance.toFixed(1),
    crashes: window.__slipstream.ship.crashCount,
    palette: window.__slipstream.renderer.palette.name,
    chunks: window.__slipstream.renderer.terrain.stats.chunks,
    tris: window.__slipstream.renderer.terrain.stats.tris,
  }));
  return { page, state };
}

// --- main play session -----------------------------------------------------
const { page, state } = await session('daily', 'http://127.0.0.1:8123/index.html',
  { width: 1280, height: 720 },
  [{ wait: 9000, file: shot('play-1.png') }, { wait: 7000, file: shot('play-2.png') }]);
console.log('--- after ~16s of autopiloted flight ---');
console.log(JSON.stringify(state, null, 2));

// Jump near the finish to exercise the finish/save/ghost path without waiting
// out a full 70-second run in a software rasteriser.
await page.evaluate(() => { window.__slipstream.ship.z = 4340; });
await page.waitForTimeout(3000);
const res = await page.evaluate(() => ({
  mode: document.body.dataset.mode,
  title: document.getElementById('res-title').textContent,
  time: document.getElementById('res-time').textContent,
  gates: document.getElementById('res-gates').textContent,
  penalty: document.getElementById('res-penalty').textContent,
  stored: localStorage.getItem('slipstream.v1') ? JSON.parse(localStorage.getItem('slipstream.v1')) : null,
}));
console.log('--- results screen ---');
console.log(JSON.stringify({ ...res, stored: res.stored ? Object.fromEntries(Object.entries(res.stored).map(([k,v])=>[k,{best:+v.best.toFixed(2), ghostKB:+(v.ghost?v.ghost.length/1024:0).toFixed(1)}])) : null }, null, 2));
await page.screenshot({ path: shot('play-results.png') });

// Reload: the PB and ghost must survive.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
const persisted = await page.evaluate(() => ({
  titleBest: document.getElementById('title-best').textContent,
  ghostChip: getComputedStyle(document.getElementById('title-ghost')).display,
  ghostSamples: window.__slipstream.ghost.count,
}));
console.log('--- after reload (persistence) ---');
console.log(JSON.stringify(persisted, null, 2));
await page.close();

// --- other palettes + a phone viewport ------------------------------------
for (const [seed, name] of [['aurora', 'look-aurora.png'], ['basalt', 'look-basalt.png']]) {
  const file = shot(name);
  const s = await session(seed, `http://127.0.0.1:8123/index.html?seed=${seed}`,
    { width: 1280, height: 720 }, [{ wait: 11000, file }]);
  console.log(`seed "${seed}": palette=${s.state.palette} z=${s.state.z} boost=${s.state.boost} gates=${s.state.gates}`);
  await s.page.close();
}
const m = await session('mobile', 'http://127.0.0.1:8123/index.html',
  { width: 390, height: 844 }, [{ wait: 9000, file: shot('look-mobile.png') }]);
console.log(`mobile: res scale=${await m.page.evaluate(()=>window.__slipstream.renderer.resolutionScale.toFixed(2))} chunks=${m.state.chunks} tris=${m.state.tris}`);
await m.page.close();

console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : '(none)');
await browser.close();

// Renders the same stretch of canyon under every palette, so day-to-day colour
// can actually be judged side by side instead of one seed at a time.
// Usage:  npx http-server -p 8123 .   then   node tools/check-palettes.mjs

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* not installed locally */ }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(root + '/')('playwright');
  } catch { /* fall through */ }
  console.error('playwright not found. Install it with:  npm i -D playwright');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '.shots');
mkdirSync(SHOTS, { recursive: true });

const AUTOPILOT = `
const g = window.__slipstream;
g.autoQuality = false; g.renderer.setResolutionScale(1);
g.input.update = function () {
  const ship = g.ship, course = g.course, run = g.run;
  const gate = course.gates[run.nextGate];
  let tx, ty, tz;
  if (gate) { tx = gate.x; ty = gate.y; tz = gate.z; }
  else { tz = ship.z + 80; tx = course.pathX(tz); ty = course.floorY(tz) + 14; }
  const gap = tz - ship.z;
  if (gap > 70) ty = Math.min(ty, course.floorY(ship.z + 40) + 8);
  const dz = Math.max(1, gap);
  let w = Math.atan2(tx - ship.x, dz) - ship.yaw;
  while (w > Math.PI) w -= 6.283185; while (w < -Math.PI) w += 6.283185;
  this.steer = Math.max(-1, Math.min(1, w * 2.6));
  const dp = Math.atan2(ty - ship.y, Math.hypot(tx - ship.x, dz));
  this.pitch = Math.max(-1, Math.min(1, (dp - ship.pitch) * 3.2));
  this.brake = Math.abs(this.steer) > 0.85 ? 1 : 0;
};`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://127.0.0.1:8123/index.html?seed=paletteboard', { waitUntil: 'load' });
await page.waitForTimeout(1600);
await page.click('#btn-start');
await page.evaluate(AUTOPILOT);
// Fly far enough in that walls, a pillar and a gate are all in frame.
await page.waitForTimeout(11000);
// Freeze the simulation so every palette shows the identical geometry.
await page.evaluate(() => { window.__slipstream.frozen = true; });

const names = await page.evaluate(async () => {
  const { PALETTES } = await import('/src/render/palettes.js');
  window.__pal = PALETTES;
  return PALETTES.map(p => p.name);
});

for (let i = 0; i < names.length; i++) {
  await page.evaluate((k) => { window.__slipstream.renderer.palette = window.__pal[k]; }, i);
  await page.waitForTimeout(350);
  const file = join(SHOTS, `palette-${i}-${names[i].toLowerCase().replace(/\s+/g, '-')}.png`);
  await page.screenshot({ path: file });
  console.log(`${String(i)}  ${names[i].padEnd(14)} -> ${file}`);
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();

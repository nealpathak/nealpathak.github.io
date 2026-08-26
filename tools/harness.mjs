// The headless harness.
//
// Serves the repo, loads the game in Chromium, collects console errors and page
// exceptions, waits for the boot screen to clear, optionally evaluates a script
// inside the page, then screenshots and reports renderer statistics.
//
// Needs Playwright and a Chromium build. Set EW_CHROMIUM to point at one.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// Port 0 lets the OS pick, so two harness runs never collide.
const PORT = Number(process.env.EW_PORT || 0);
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const port = server.address().port;

const args = process.argv.slice(2);
const out = args[0] || `${process.env.HOME || '/tmp'}/shot.png`;
const waitMs = Number(args[1] || 4000);
const script = args[2] || null;   // optional path to a JS file evaluated in page

const browser = await chromium.launch({
  executablePath: process.env.EW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
         '--enable-webgl','--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(1,5).join('\n')}`));
page.on('requestfailed', r => logs.push(`[404?] ${r.url()} ${r.failure()?.errorText}`));

await page.goto(`http://127.0.0.1:${port}/${process.env.EW_Q||''}`, { waitUntil: 'load' });

let booted = true;
try {
  await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('boot--done'), { timeout: 30000 });
} catch { booted = false; }

if (script && fs.existsSync(script)) {
  const src = fs.readFileSync(script, 'utf8');
  try {
    const result = await page.evaluate(src);
    if (result !== undefined) logs.push(`[eval] ${JSON.stringify(result, null, 1)}`);
  } catch (e) { logs.push(`[eval-error] ${e.message}`); }
}

await page.waitForTimeout(waitMs);

const after = process.env.EW_AFTER;
if (after && fs.existsSync(after)) {
  try {
    const result = await page.evaluate(fs.readFileSync(after, 'utf8'));
    if (result !== undefined) logs.push(`[after] ${JSON.stringify(result, null, 1)}`);
  } catch (e) { logs.push(`[after-error] ${e.message}`); }
}

const stats = await page.evaluate(() => {
  const e = window.emberwake;
  if (!e) return { error: 'window.emberwake missing' };
  const info = e.engine.renderer.gl.info;
  return {
    fps: +e.engine.loop.fps.toFixed(1),
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs?.length,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    debug: e.game?.debugStats?.() ?? null,
  };
});

await page.screenshot({ path: out });
await browser.close();
server.close();

console.log('booted:', booted);
console.log('stats:', JSON.stringify(stats));
const noisy = logs.filter(l => !/\[log\]|\[info\]|\[debug\]/.test(l));
if (noisy.length) { console.log('--- console ---'); console.log(noisy.slice(0, 40).join('\n')); }
else console.log('console: clean');
process.exit(booted && !noisy.some(l=>/pageerror|\[error\]/.test(l)) ? 0 : 1);

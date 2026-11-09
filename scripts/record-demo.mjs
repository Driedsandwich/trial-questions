#!/usr/bin/env node
/**
 * npm ci && npx playwright install chromium
 * node scripts/record-demo.mjs --out <artifact-directory>/video_out [--scene 1..5]
 * Films the public app with Playwright and live registry data. No fixtures, keys,
 * narration or subtitles. FFMPEG / FFPROBE may name alternate executables.
 * Scene 5 starts the compiled repository MCP server and films actual JSON-RPC.
 * Output, including the full MCP transcript, must be outside the repository.
 */
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
if (!option('--out')) throw new Error('Pass --out <artifact-directory>/video_out');
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
await mkdir(resolve(option('--out')), { recursive: true });
const output = await realpath(resolve(option('--out')));
const diff = relative(root, output);
if (!diff || (!diff.startsWith('../') && !isAbsolute(diff))) throw new Error('Store artifacts outside the repository.');
const only = option('--scene') === undefined ? null : Number(option('--scene'));
if (only !== null && (!Number.isInteger(only) || only < 1 || only > 5)) throw new Error('--scene must be 1..5');
const baseURL = option('--url', 'https://driedsandwich.github.io/trial-questions/');
const ffmpeg = process.env.FFMPEG || 'ffmpeg', ffprobe = process.env.FFPROBE || 'ffprobe';
const pause = ms => new Promise(r => setTimeout(r, ms));
const profile = { age: 54, sex: 'FEMALE' };
const viewport = { width: 1600, height: 900 };
const scenes = [
  ['The problem', 25, 'The real public landing page, with its search form and safety notice.'],
  ['Find recruiting trials', 25, 'Open optional age and sex, enter fictional age 54 and Female, then select Asthma and show live recruiting trials.'],
  ['Source-linked questions', 45, 'Select one real trial. Show original criteria, paired questions, connecting lines and hover highlights, then Auto-checked and Ask your doctor registry rows.'],
  ['Safety, optional AI and visit sheet', 25, 'Show the safety notice, empty AI key settings and visible destination, then the actual visit sheet. No AI request is sent.'],
  ['Live MCP tools', 30, 'Start the real repository stdio server. Execute tools/list and tools/call get_trial_checklist with the same real NCT ID and fictional profile. Display actual response JSON.'],
].map(([title, duration, content], i) => ({ number: i + 1, id: `scene_${String(i + 1).padStart(2, '0')}`, title, duration, content, file: `scene_${String(i + 1).padStart(2, '0')}.mp4` }));
const storyboard = { schemaVersion: 2, title: 'Trial Questions — live demo', appUrl: baseURL, audio: false, burnedInSubtitles: false, subtitleTracks: false, fictionalProfile: profile, scenes };
await writeFile(join(output, 'scenes.json'), JSON.stringify(storyboard, null, 2) + '\n');
function run(command, argv) {
  return new Promise((res, rej) => {
    const child = spawn(command, argv, { cwd: root, stdio: 'inherit' });
    child.on('error', rej); child.on('exit', code => code === 0 ? res() : rej(new Error(`${command} exited ${code}`)));
  });
}
for (const command of [ffmpeg, ffprobe]) if (spawnSync(command, ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('Install ffmpeg and ffprobe.');
await run('npm', ['run', 'build']);

// Decorations are ephemeral. The app DOM and its real content are not replaced.
async function decorate(page, fictional = false) {
  await page.evaluate(fictional => {
    const style = document.createElement('style');
    style.textContent = `*{cursor:none!important} #demo-pointer{position:fixed;left:30px;top:80px;width:26px;height:26px;border:2px solid #c38d2c;background:#f6c56335;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2147483647;box-shadow:0 0 0 2px #ffffffb0} #demo-label{position:fixed;right:18px;bottom:14px;z-index:2147483645;background:#fff;color:#0f5c5e;border:1px solid #aecac8;border-radius:6px;padding:5px 10px;font:500 13px system-ui;pointer-events:none}`;
    document.head.append(style);
    const pointer = document.createElement('div'); pointer.id = 'demo-pointer'; document.documentElement.append(pointer);
    document.addEventListener('mousemove', e => {
      const layer = document.querySelector('dialog[open]') || document.documentElement;
      if (pointer.parentElement !== layer) layer.append(pointer);
      pointer.style.left = e.clientX + 'px'; pointer.style.top = e.clientY + 'px';
    }, true);
    if (fictional) { const label = document.createElement('div'); label.id = 'demo-label'; label.textContent = 'Fictional profile'; document.documentElement.append(label); }
  }, fictional);
}
async function point(page, target, click = false) {
  await target.waitFor({ state: 'visible' });
  let b = await target.boundingBox();
  if (!b || b.y < 65 || b.y + b.height > viewport.height - 40) {
    await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await pause(650);
    b = await target.boundingBox();
  }
  if (!b) throw new Error('Target is not visible');
  await page.mouse.move(b.x + Math.min(b.width / 2, 220), b.y + b.height / 2, { steps: 18 });
  if (click) { await pause(150); await target.click(); }
}
async function position(page, target, offset = 120, behavior = 'smooth') {
  await target.evaluate((el, { offset, behavior }) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - offset, behavior }), { offset, behavior });
  await pause(800);
}
async function enterProfile(page) {
  await page.locator('.profile summary').click();
  await page.getByLabel('Age in years', { exact: true }).fill(String(profile.age));
  await page.getByLabel('Sex as entered').selectOption(profile.sex);
  await page.locator('.profile summary').click();
}
let selectedId;
try { selectedId = JSON.parse(await readFile(join(output, 'scene_02_capture.json'), 'utf8')).nctId; } catch {}
async function search(page) {
  const responsePromise = page.waitForResponse(r => r.url().startsWith('https://clinicaltrials.gov/api/v2/studies?') && r.status() === 200, { timeout: 45000 });
  await point(page, page.getByRole('button', { name: 'Asthma', exact: false }), true);
  const data = await (await responsePromise).json();
  await page.locator('.trial-card').first().waitFor({ timeout: 45000 });
  if (!selectedId) {
    const suitable = data.studies.find(s => {
      const e = s.protocolSection.eligibilityModule;
      const minimum = /^(\d+) Years?$/.exec(e?.minimumAge ?? '');
      return minimum && Number(minimum[1]) <= profile.age && e.eligibilityCriteria && s.protocolSection.statusModule.overallStatus === 'RECRUITING';
    });
    if (!suitable) throw new Error('No suitable real recruiting trial in this live result page.');
    selectedId = suitable.protocolSection.identificationModule.nctId;
  }
  await page.locator('.trial-card').filter({ hasText: selectedId }).waitFor();
}
async function selectTrial(page) {
  await point(page, page.locator('.trial-card').filter({ hasText: selectedId }), true);
  await page.locator('.paired-row:not(.structured-row)').first().waitFor({ timeout: 45000 });
  if (!await page.locator('.structured-row .status-matched').count()) throw new Error('Auto-checked is missing.');
  if (!await page.locator('.structured-row .status-ask_doctor').count()) throw new Error('Ask your doctor is missing.');
}
async function capture(page, name) { await page.screenshot({ path: join(output, name + '.png') }); }

// Raw JSON-RPC stdio, including initialization; no substitute server or mocked data.
let mcp;
async function startMcp() {
  const child = spawn(process.execPath, ['dist/mcp/server.js'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const transcript = [], pending = new Map(); let stderr = '';
  child.stderr.on('data', b => { stderr += b; });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    transcript.push({ direction: 'server', message: JSON.parse(line), raw: line });
    const message = JSON.parse(line); const waiter = pending.get(message.id);
    if (waiter) { clearTimeout(waiter.timer); pending.delete(message.id); waiter.resolve(message); }
  });
  child.on('exit', () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(`MCP exited: ${stderr}`)); } pending.clear(); });
  function send(message) {
    const raw = JSON.stringify(message); transcript.push({ direction: 'client', message, raw }); child.stdin.write(raw + '\n');
  }
  function request(message) {
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => { pending.delete(message.id); reject(new Error('MCP request timed out')); }, 45000);
      pending.set(message.id, { resolve: resolveRequest, reject, timer }); send(message);
    });
  }
  const init = await request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'trial-demo-recorder', version: '1.0.0' } } });
  if (!init.result?.serverInfo) throw new Error('MCP initialization failed');
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return { child, transcript, request, serverInfo: init.result.serverInfo };
}
async function terminal(page) {
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Trial Questions · live MCP session</title><style>
    *{box-sizing:border-box}body{margin:0;background:#101a22;color:#dce9ed;font:18px/1.5 ui-monospace,monospace;padding:42px 46px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #354b58;padding-bottom:22px;margin-bottom:26px}h1{font:600 30px system-ui;margin:0}header span{color:#8bd9c6;font-size:17px}.grid{display:grid;grid-template-columns:39% 61%;height:722px}section{min-width:0;padding-right:24px}section+section{border-left:1px solid #354b58;padding-left:26px;padding-right:0}h2{font:500 16px system-ui;text-transform:uppercase;letter-spacing:2px;color:#8bd9c6;margin:0 0 16px}pre{font:17px/1.55 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;height:650px;overflow:auto;scroll-behavior:smooth}#request{color:#f4d197}#status{font:14px system-ui;color:#a5bac5;margin-top:16px}#profile{position:fixed;right:20px;bottom:14px;color:#b5ccc8;font:13px system-ui}
    </style><header><h1>Trial Questions / MCP</h1><span>stdio · ${mcp.serverInfo.name} · connected</span></header><div class="grid"><section><h2>Client → server</h2><pre id="request"></pre></section><section><h2 id="response-label">Server → client</h2><pre id="response"></pre><div id="status">Live local server · ClinicalTrials.gov</div></section></div><span id="profile">Fictional profile</span></html>`);
}
async function showRequest(page, message) {
  await page.locator('#request').evaluate((el, text) => { el.textContent = text; }, JSON.stringify(message, null, 2));
  await page.locator('#response').evaluate(el => { el.textContent = 'Waiting for server…'; el.scrollTop = 0; });
}
async function showResponse(page, data, label) {
  await page.locator('#response-label').evaluate((el, text) => { el.textContent = text; }, label);
  await page.locator('#response').evaluate((el, text) => { el.textContent = text; el.scrollTop = 0; }, JSON.stringify(data, null, 2));
}
async function scrollJson(page, needle) {
  await page.locator('#response').evaluate((el, needle) => {
    const index = el.textContent.indexOf(needle); if (index < 0) throw new Error('JSON field missing');
    const range = document.createRange(); range.setStart(el.firstChild, index); range.setEnd(el.firstChild, index + needle.length);
    el.scrollTo({ top: el.scrollTop + range.getBoundingClientRect().top - el.getBoundingClientRect().top - 20, behavior: 'smooth' });
  }, needle);
}
const actions = [
  {
    async prepare() {},
    async play(p, at) {
      await at(3, () => point(p, p.locator('h1')));
      await at(10, () => point(p, p.getByLabel('Condition', { exact: true })));
      await at(17, () => point(p, p.locator('.notice')));
      await at(21, () => capture(p, 'scene_01_home'));
    },
  },
  {
    async prepare() {},
    async play(p, at) {
      await at(1, () => point(p, p.locator('.profile summary'), true));
      await at(3, async () => { await point(p, p.getByLabel('Age in years', { exact: true }), true); await p.getByLabel('Age in years', { exact: true }).pressSequentially('54', { delay: 250 }); });
      await at(6, async () => { await point(p, p.getByLabel('Sex as entered')); await p.getByLabel('Sex as entered').selectOption(profile.sex); });
      await at(8, () => capture(p, 'scene_02_profile'));
      await at(10, () => point(p, p.locator('.profile summary'), true));
      await at(12, () => search(p));
      await at(19, () => point(p, p.locator('.trial-card').filter({ hasText: selectedId })));
      await at(22, () => capture(p, 'scene_02_results'));
    },
  },
  {
    async prepare(p) { await enterProfile(p); await search(p); },
    async play(p, at) {
      await at(1, () => selectTrial(p));
      await at(6, () => position(p, p.locator('.column-headings'), 105));
      const rows = p.locator('.paired-row:not(.structured-row)');
      await at(8, () => point(p, rows.first().locator('.source-cell')));
      await at(12, () => point(p, rows.first().locator('.connector')));
      await at(15, () => point(p, rows.first().locator('.question-cell')));
      await at(18, () => capture(p, 'scene_03_pairing'));
      await at(20, () => point(p, rows.nth(1).locator('.source-cell')));
      await at(23, () => point(p, rows.nth(1).locator('.question-cell')));
      await at(27, () => position(p, p.getByRole('heading', { name: /Registry fields/ }), 100, 'instant'));
      await at(29, () => point(p, p.locator('.structured-row').first().locator('.question-cell')));
      await at(33, () => capture(p, 'scene_03_auto_checked'));
      await at(35, () => point(p, p.locator('.structured-row').last().locator('.question-cell')));
      await at(40, () => capture(p, 'scene_03_ask_doctor'));
    },
  },
  {
    async prepare(p) { await enterProfile(p); await search(p); await selectTrial(p); await position(p, p.locator('.notice'), 130, 'instant'); },
    async play(p, at) {
      await at(1, () => point(p, p.locator('.notice')));
      await at(4, () => capture(p, 'scene_04_safety'));
      await at(6, async () => { await p.getByRole('button', { name: 'AI settings', exact: true }).click(); });
      await at(8, async () => {
        if (await p.getByLabel('API key', { exact: false }).inputValue() !== '') throw new Error('API key must remain empty');
        await point(p, p.locator('.destination'));
      });
      await at(12, () => capture(p, 'scene_04_ai_destination'));
      await at(15, async () => { await p.getByRole('button', { name: 'Close AI settings' }).click(); await p.getByRole('button', { name: /Prepare visit sheet/ }).first().click(); await p.frameLocator('iframe').getByRole('heading', { name: 'Questions for my doctor' }).waitFor(); });
      await at(18, () => position(p, p.locator('.preview-label'), 110));
      await at(21, () => capture(p, 'scene_04_visit_sheet'));
    },
  },
  {
    async prepare(p) {
      if (!selectedId) { await enterProfile(p); await search(p); }
      mcp = await startMcp(); await terminal(p);
    },
    async play(p, at) {
      await at(1, async () => {
        const request = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
        await showRequest(p, request); const response = await mcp.request(request);
        if (!response.result?.tools.some(t => t.name === 'get_trial_checklist')) throw new Error('Real MCP tool missing');
        await writeFile(join(output, 'mcp-tools-list.json'), JSON.stringify(response, null, 2) + '\n');
        await showResponse(p, response, 'Server → client · tools/list result');
      });
      await at(4, () => scrollJson(p, '"name": "get_trial_checklist"'));
      await at(7, () => capture(p, 'scene_05_tools_list'));
      await at(9, async () => {
        const request = { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_trial_checklist', arguments: { nctId: selectedId, ...profile } } };
        await showRequest(p, request); const response = await mcp.request(request);
        if (response.error || response.result?.isError) throw new Error('Live MCP checklist call failed');
        const checklist = JSON.parse(response.result.content[0].text);
        if (checklist.nctId !== selectedId || !checklist.items.length || !checklist.structured.some(s => s.status === 'matched')) throw new Error('MCP response missing real checklist/age comparison');
        await writeFile(join(output, 'mcp-tools-call.json'), JSON.stringify(response, null, 2) + '\n');
        await showResponse(p, checklist, 'result.content[0].text · JSON decoded, values unchanged');
      });
      await at(14, () => capture(p, 'scene_05_call_provenance'));
      await at(16, () => scrollJson(p, '"items":'));
      await at(20, () => capture(p, 'scene_05_call_questions'));
      await at(22, () => scrollJson(p, '"structured":'));
      await at(27, () => capture(p, 'scene_05_call_comparisons'));
      await writeFile(join(output, 'mcp-transcript.jsonl'), mcp.transcript.map(e => JSON.stringify(e)).join('\n') + '\n');
    },
  },
];

const scratch = await mkdtemp(join(tmpdir(), 'trial-demo-'));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (let i = 0; i < scenes.length; i++) {
    if (only !== null && only !== i + 1) continue;
    const spec = scenes[i]; console.log(`Recording ${spec.id} (${spec.duration}s)…`);
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', recordVideo: { dir: scratch, size: viewport } });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = [], requests = [], blocked = [], timeline = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith('https://clinicaltrials.gov/api/v2/')) requests.push({ url: r.url(), status: r.status() }); });
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() === 'GET' && (url.origin === new URL(baseURL).origin || (url.hostname === 'clinicaltrials.gov' && url.pathname.startsWith('/api/v2/')))) return route.continue();
      blocked.push({ method: req.method(), url: req.url() }); return route.abort('blockedbyclient');
    });
    let duration, videoPath;
    try {
      await page.goto(baseURL); await page.getByRole('button', { name: 'Asthma', exact: false }).waitFor();
      await decorate(page, i > 0); await actions[i].prepare(page); await pause(600);
      await capture(page, spec.id + '_start');
      const started = performance.now();
      const at = async (seconds, action) => {
        await pause(Math.max(0, seconds * 1000 - (performance.now() - started)));
        await action(); timeline.push({ scheduled: seconds, completed: Number(((performance.now() - started) / 1000).toFixed(3)) });
      };
      await actions[i].play(page, at);
      await pause(Math.max(1500, spec.duration * 1000 - (performance.now() - started)));
      await capture(page, spec.id + '_end'); duration = (performance.now() - started) / 1000;
      if (errors.length || blocked.length) throw new Error(`Unexpected browser errors/requests: ${JSON.stringify({ errors, blocked })}`);
      if (i > 0 && i < 4 && !requests.some(r => r.status === 200)) throw new Error('No successful live API request');
      videoPath = await page.video().path();
    } finally { await context.close(); }
    const target = Math.max(spec.duration, Math.round(duration));
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-sseof', String(-duration), '-i', videoPath, '-an', '-sn', '-vf', `fps=30,scale=1920:1080:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=2,trim=duration=${target},setpts=PTS-STARTPTS`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-t', String(target), '-threads', '4', '-movflags', '+faststart', join(output, spec.file)]);
    const media = JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(output, spec.file)], { encoding: 'utf8' }).stdout);
    const v = media.streams[0];
    if (media.streams.length !== 1 || v.codec_name !== 'h264' || v.width !== 1920 || v.height !== 1080 || v.avg_frame_rate !== '30/1' || Math.abs(Number(media.format.duration) - target) > 0.04) throw new Error('Scene format verification failed');
    spec.duration = target;
    await writeFile(join(output, `${spec.id}_capture.json`), JSON.stringify({ scene: spec.id, duration: target, nctId: i > 0 ? selectedId : undefined, appUrl: baseURL, requests, fictionalProfile: i > 0 ? profile : undefined, aiCalls: 0, timeline, errors, blocked, mcpTranscript: i === 4 ? 'mcp-transcript.jsonl' : undefined }, null, 2) + '\n');
    console.log(`Finished ${spec.id}: ${target}s`);
  }
  for (const scene of scenes) { try { scene.duration = JSON.parse(await readFile(join(output, `${scene.id}_capture.json`), 'utf8')).duration; } catch {} }
  await writeFile(join(output, 'scenes.json'), JSON.stringify(storyboard, null, 2) + '\n');
  await writeFile(join(output, 'capture-metadata.json'), JSON.stringify({ capturedAt: new Date().toISOString(), browser: browser.version(), appUrl: baseURL, viewport, resolution: '1920x1080', fps: 30, audio: false, burnedInSubtitles: false, nctId: selectedId, fictionalProfile: profile, registryData: 'Live ClinicalTrials.gov; no mocks or replay', mcp: 'Real repository stdio server; full JSON-RPC transcript retained' }, null, 2) + '\n');
} finally {
  mcp?.child.kill('SIGTERM'); await browser?.close(); await rm(scratch, { recursive: true, force: true });
}

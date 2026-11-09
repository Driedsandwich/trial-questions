#!/usr/bin/env node
/**
 * npm ci && npx playwright install chromium
 * node scripts/record-demo.mjs --out <artifact-directory>/video_out [--scene 3]
 * Requires ffmpeg / ffprobe on PATH (or FFMPEG / FFPROBE environment variables).
 * Builds the app, owns a Vite preview process, and records only with Playwright.
 * Change SCENES below when the UI changes. No API fixtures, saved keys or profiles.
 * Playwright's native video is converted to constant 30 fps H.264, without audio.
 * Intro/MCP cards are recording-only HTML; they are not app features.
 */
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
if (!option('--out')) throw new Error('Usage: node scripts/record-demo.mjs --out <output-directory> [--scene 1..5]');
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
await mkdir(resolve(option('--out')), { recursive: true });
const output = await realpath(resolve(option('--out')));
const diff = relative(root, output);
if (!diff || (!diff.startsWith('..' + '/') && !isAbsolute(diff))) throw new Error('Store video artifacts outside the repository.');
const only = option('--scene') === undefined ? null : Number(option('--scene'));
if (only !== null && (!Number.isInteger(only) || only < 1 || only > 5)) throw new Error('--scene must be 1..5');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const ffprobe = process.env.FFPROBE || 'ffprobe';
const port = Number(option('--port', '4178'));
const baseURL = `http://127.0.0.1:${port}/trial-questions/`;
const pause = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function run(command, argv, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, argv, { cwd: root, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)));
  });
}
for (const command of [ffmpeg, ffprobe]) {
  if (spawnSync(command, ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('Install ffmpeg and ffprobe, or set FFMPEG and FFPROBE.');
}

const subtitles = [
  [
    'Trial language can be hard to turn into questions.',
    'For patients and families, eligibility criteria may feel unfamiliar.',
    'A long list of requirements can leave you unsure what to ask.',
    'Trial Questions is a concept for preparing that conversation.',
    'It keeps the original wording beside questions for your doctor.',
  ],
  [
    'Start with a public trial record.',
    'Paste a ClinicalTrials.gov trial ID or link into the field.',
    'Then select Load trial to bring the eligibility text into view.',
    'The design also allows optional comparison of age and sex fields.',
    'These comparisons support questions; they do not decide participation.',
  ],
  [
    'Keep every question connected to its source.',
    'The left column preserves the original eligibility wording.',
    'The right column turns that wording into questions for your doctor.',
    'Follow each connecting line to see which passage prompted a question.',
    'For example: Which of my past treatments matter?',
    'Age can be compared with a stated age field.',
    'Missing information stays unconfirmed, and clinical criteria need review.',
    'Select Create visit sheet to collect the questions on one page.',
    'The sheet is designed to carry the questions and their sources.',
  ],
  [
    'This tool does not decide whether you can join a trial.',
    'Bring these questions to your doctor.',
    'It offers no eligibility decisions, diagnosis, or treatment advice.',
    'It does not replace clinician review.',
    'Data from ClinicalTrials.gov. Review the original record with your doctor.',
  ],
  [
    'Designed for people and AI agents, with sources attached.',
    'The proposed MCP interface offers another way to request questions.',
    'An agent would call generate questions with a public trial identifier.',
    'The proposed response includes questions, original excerpts, and source links.',
    'Next steps are clinician review, usability testing, and accessible export.',
    'Trial Questions: prepare for a conversation with your doctor.',
  ],
];
const storyboard = {
  title: 'Trial Questions — Demo storyboard',
  schemaVersion: 1,
  subtitleTiming: 'Consecutive five-second cues from the supplied storyboard. With narration, cue times scale to the final scene length; no speech alignment is inferred.',
  adaptations: [
    'Subtitles and narration are preserved verbatim from the concept storyboard, even where the current UI differs.',
    'Scene 1 is a recording-only HTML illustration, with no people or photographs.',
    'Scene 2 uses the real Asthma example search and trial cards. The current UI has no ID/link field or Load trial button.',
    'Scene 3 uses real registry wording, source references and Prepare visit sheet. Age 54 is explicitly fictional; sex is not provided. No patient information is used.',
    'Scene 4 also shows the empty optional AI settings. No rewriting is submitted.',
    'Scene 5 shows a Proposed generate_questions(trial_id) concept, not a successful call. The repository actually supplies search_trials and get_trial_checklist over local stdio; this is disclosed on the card.',
    'Raw scene clips contain UI and explanatory cards, but no subtitle track or narration.',
  ],
  scenes: subtitles.map((lines, i) => ({
    number: i + 1,
    id: `scene_${String(i + 1).padStart(2, '0')}`,
    title: ['The problem', 'Start here', 'Source-linked questions', 'Safety and sources', 'MCP and close'][i],
    duration: lines.length * 5,
    subtitles: lines.map((text, j) => ({ start: j * 5, end: (j + 1) * 5, text })),
    narration: lines.join(' '),
  })),
};
await writeFile(join(output, 'scenes.json'), JSON.stringify(storyboard, null, 2) + '\n');

// All filming decoration is ephemeral and confined to this fresh browser context.
async function installPointer(page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = `
      html {scroll-behavior:smooth} * {cursor:none!important}
      #demo-pointer {position:fixed;left:80px;top:80px;width:34px;height:34px;border:3px solid #ca8a26;background:#f6c56350;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:2147483647;box-shadow:0 0 0 3px #ffffffbf}
      #demo-pointer.down {background:#f6c563b0;transform:translate(-50%,-50%) scale(.8)}
      #demo-label {position:fixed;left:24px;top:110px;max-width:270px;z-index:2147483645;background:#fff;color:#0f5c5e;border:1px solid #aecac8;border-radius:8px;padding:8px 14px;font:600 15px/1.4 system-ui;pointer-events:none}
      .demo-card {position:fixed;inset:0;z-index:1000000;background:#f1f5f4;color:#233238;padding:66px 100px;font-family:system-ui;box-sizing:border-box}
      .demo-card * {box-sizing:border-box}
      .demo-card .kicker {font-size:20px;letter-spacing:3px;color:#0f5c5e;font-weight:700;margin:0 0 22px}
      .demo-card h1 {font-size:56px;line-height:1.15;letter-spacing:-1.8px;max-width:1450px;margin:0 0 32px}
      .demo-card h2 {font-size:32px;margin:0 0 22px}
      .demo-card p {font-size:25px;line-height:1.5;margin:0 0 22px}
      .demo-card .grid {display:grid;grid-template-columns:1fr 1fr;gap:58px;margin-top:35px}
      .demo-card .paper {background:#fff;border:1px solid #c9d9d6;border-radius:18px;padding:40px;box-shadow:0 20px 50px #173e3510;transition:box-shadow 1s,transform 1s}
      .demo-card .focus {box-shadow:0 0 0 5px #449d94,0 25px 50px #173e3520;transform:translateY(-5px)}
      .demo-card .line {height:12px;background:#dce6e4;margin:22px 0;border-radius:6px}
      .demo-card .notebook {background:repeating-linear-gradient(#fff 0px,#fff 53px,#dce6e4 54px,#fff 55px);height:235px;border-left:3px solid #e3bb88;margin:28px 0 0;padding-left:25px}
      .demo-card .tag {display:inline-block;color:#0f5c5e;background:#e5f1ee;border-radius:40px;padding:9px 18px;font-size:18px;margin-bottom:22px}
      .demo-card .fine {font-size:19px;color:#526b69}
      .demo-card .safety {position:absolute;left:100px;right:100px;bottom:128px;border-top:1px solid #b9ceca;padding-top:22px;font-size:21px;line-height:1.5}
      .demo-card code {font-size:27px;line-height:1.8;color:#0f5c5e}
      .demo-card .field {padding:12px 0;border-bottom:1px solid #dce6e4;font-size:26px}
    `;
    document.head.append(style);
    const pointer = document.createElement('div'); pointer.id = 'demo-pointer';
    document.documentElement.append(pointer);
    document.addEventListener('mousemove', e => {
      // Native modal dialogs live above every document z-index. Move the ring
      // into the active dialog's top layer so it remains visible over key fields.
      const layer = document.querySelector('dialog[open]') || document.documentElement;
      if (pointer.parentElement !== layer) layer.append(pointer);
      pointer.style.left = e.clientX + 'px'; pointer.style.top = e.clientY + 'px';
    }, true);
    document.addEventListener('mousedown', () => pointer.classList.add('down'), true);
    document.addEventListener('mouseup', () => pointer.classList.remove('down'), true);
  });
}
async function label(page, text = '') {
  await page.evaluate(text => {
    document.getElementById('demo-label')?.remove();
    if (!text) return;
    const el = document.createElement('div'); el.id = 'demo-label'; el.textContent = text;
    document.documentElement.append(el);
  }, text);
}
async function card(page, html) {
  await page.evaluate(html => {
    document.getElementById('demo-card')?.remove();
    if (!html) return;
    const el = document.createElement('section'); el.className = 'demo-card'; el.id = 'demo-card'; el.innerHTML = html;
    document.body.append(el);
  }, html);
}
async function focusCard(page, id) {
  await page.evaluate(id => {
    document.querySelectorAll('.demo-card .focus').forEach(el => el.classList.remove('focus'));
    document.getElementById(id)?.classList.add('focus');
  }, id);
}
async function point(page, locator, click = false) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  if (!box || box.y < 0 || box.y + box.height > 1030) {
    await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    await pause(900);
  }
  const b = await locator.boundingBox();
  if (!b) throw new Error('Target has no bounding box');
  await page.mouse.move(b.x + Math.min(b.width / 2, 260), b.y + b.height / 2, { steps: 20 });
  await pause(300);
  if (click) { await page.mouse.down(); await pause(150); await page.mouse.up(); }
}
async function position(page, locator, offset = 90) {
  await locator.evaluate((el, offset) => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - offset, behavior: 'smooth' }), offset);
  await pause(1000);
}
async function search(page) {
  await point(page, page.getByRole('button', { name: 'Asthma', exact: false }), true);
  await page.locator('.trial-card').first().waitFor({ timeout: 45000 });
}
async function loadTrial(page) {
  await search(page);
  // Select a result with criteria through the real app. A changed API order is OK.
  await point(page, page.locator('.trial-card').first(), true);
  await page.locator('.paired-row:not(.structured-row)').first().waitFor({ timeout: 45000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await pause(400);
  return (await page.locator('.selected-trial .trial-top').innerText()).match(/NCT\d{8}/)[0];
}
const safety = '<div class="safety">This tool does not decide whether you can join a trial. Bring these questions to your doctor.<br><strong>Data from ClinicalTrials.gov</strong></div>';
const intro = `
  <p class="kicker">TRIAL QUESTIONS / DSH HACKS V2</p>
  <h1>Trial language can be hard<br>to turn into questions.</h1>
  <div class="grid">
    <div class="paper" id="criteria-card"><span class="tag">Illustration · not a trial record</span><h2>Eligibility criteria</h2><p>What does this requirement mean?</p><div class="line"></div><div class="line" style="width:85%"></div><div class="line" style="width:93%"></div><div class="line" style="width:72%"></div><p style="margin-top:35px;color:#0f5c5e">Where do I start?</p></div>
    <div class="paper" id="notebook-card"><span class="tag">A place to begin the conversation</span><h2>Questions for my doctor</h2><p>Keep the original. Find the question.</p><div class="notebook"></div></div>
  </div>${safety}`;

// Scene operations: keep selectors and choreography here, separate from encoding.
const SCENES = [
  {
    async prepare(p) { await card(p, intro); },
    async play(p, at) {
      await at(2, () => point(p, p.locator('#criteria-card h2')));
      await at(8, async () => { await focusCard(p, 'criteria-card'); await point(p, p.getByText('Where do I start?', { exact: true })); });
      await at(18, async () => { await focusCard(p, 'notebook-card'); await point(p, p.locator('#notebook-card h2')); });
    },
  },
  {
    async prepare() {},
    async play(p, at) {
      await at(2, () => point(p, p.getByLabel('Condition', { exact: true })));
      await at(7, () => search(p));
      await at(13, () => point(p, p.locator('.trial-card').first()));
      await at(17, () => point(p, p.locator('.profile summary'), true));
      await at(20, () => point(p, p.getByLabel('Age in years', { exact: true })));
    },
  },
  {
    async prepare(p) {
      const id = await loadTrial(p);
      await p.locator('.profile summary').click();
      await p.getByLabel('Age in years', { exact: true }).fill('54');
      await p.locator('.profile summary').click();
      await label(p, 'Demonstration only · fictional age 54 · sex not provided');
      await position(p, p.locator('.questions-heading'), 110);
      return id;
    },
    async play(p, at) {
      const rows = p.locator('.paired-row:not(.structured-row)');
      await at(2, () => point(p, rows.first().locator('.source-cell')));
      await at(8, () => position(p, p.locator('.column-headings'), 110));
      await at(11, () => point(p, rows.first().locator('.connector')));
      await at(14, () => point(p, rows.first().locator('.question-cell')));
      await at(19, () => point(p, rows.nth(1).locator('.source-ref')));
      await at(22, () => point(p, rows.nth(1).locator('.question-cell')));
      await at(25, () => position(p, p.locator('.structured-row').first(), 150));
      await at(28, () => point(p, p.locator('.structured-row').first().locator('.question-cell')));
      await at(31, () => point(p, p.locator('.structured-row').nth(2).locator('.question-cell')));
      await at(35, async () => {
        await position(p, p.locator('.questions-heading'), 110);
        await point(p, p.getByRole('button', { name: /Prepare visit sheet/ }).first(), true);
        await p.frameLocator('iframe').getByRole('heading', { name: 'Questions for my doctor' }).waitFor();
      });
      await at(40, () => point(p, p.locator('.preview-label')));
    },
  },
  {
    async prepare(p) {
      const id = await loadTrial(p);
      await p.locator('.provenance summary').click();
      await position(p, p.locator('.provenance'), 200);
      return id;
    },
    async play(p, at) {
      await at(1, () => point(p, p.locator('.notice')));
      await at(8, async () => {
        // Cut directly to the settings view: a long criteria list can make a
        // smooth full-document scroll consume most of this short scene.
        await p.locator('.reading-tools').evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 180, behavior: 'instant' }));
        await p.getByRole('button', { name: 'AI settings', exact: true }).click();
      });
      await at(12, () => point(p, p.getByLabel('API key', { exact: false })));
      await at(17, async () => {
        await p.getByRole('button', { name: 'Close AI settings' }).click();
        await p.locator('.provenance').evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 200, behavior: 'instant' }));
      });
      await at(20, () => point(p, p.locator('.provenance a')));
    },
  },
  {
    async prepare(p) {
      const id = await loadTrial(p);
      await p.getByRole('button', { name: /Prepare visit sheet/ }).first().click();
      await p.frameLocator('iframe').getByRole('heading', { name: 'Questions for my doctor' }).waitFor();
      await card(p, `<p class="kicker">TRIAL QUESTIONS / INTERFACE CONCEPT</p><h1>Designed for people and AI agents,<br>with sources attached.</h1><div class="grid"><div class="paper" id="request-card"><span class="tag">Proposed · no live call</span><h2>An agent could ask</h2><p>Prepare doctor questions<br>for public trial ${esc(id)}.</p><code>generate_questions(trial_id)</code><p class="fine" style="margin-top:26px">Concept signature from the storyboard.<br>No request is executed in this scene.</p></div><div class="paper" id="response-card"><span class="tag">Proposed return content</span><div class="field">Questions for the doctor</div><div class="field">Original eligibility excerpts</div><div class="field">Source links + public trial ID</div><p class="fine" style="margin-top:25px">Current repository: local stdio tools<br><code style="font-size:20px">search_trials · get_trial_checklist</code><br>No hosted MCP endpoint is demonstrated.</p></div></div>${safety}`);
      return id;
    },
    async play(p, at) {
      await at(2, () => point(p, p.locator('#request-card h2')));
      await at(8, async () => { await focusCard(p, 'request-card'); await point(p, p.locator('#request-card code')); });
      await at(13, async () => { await focusCard(p, 'response-card'); await point(p, p.locator('#response-card .field').first()); });
      await at(17, () => point(p, p.locator('#response-card .field').last()));
      await at(20, async () => { await card(p, ''); await point(p, p.locator('.preview-label')); });
      await at(25, () => card(p, `<p class="kicker">DSH HACKS V2 / AI × HEALTHCARE</p><h1 style="font-size:100px;margin-top:80px">Trial Questions<span style="color:#0f5c5e">.</span></h1><p style="font-size:44px;max-width:1250px">Prepare for a conversation<br>with your doctor.</p><div class="paper" style="margin-top:45px;padding:28px 36px"><span class="tag" style="margin-bottom:12px">Next steps</span><p style="margin:0">Clinician review · usability testing · accessible export</p></div>${safety}`));
    },
  },
];

await run('npm', ['run', 'build']);
const scratch = await mkdtemp(join(tmpdir(), 'trial-demo-'));
let preview, browser;
let previewLog = '';
const records = [];
// Also release the preview port if a recording is interrupted from the terminal.
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    if (interrupted) return;
    interrupted = true;
    preview?.kill('SIGTERM');
    try { await browser?.close(); } catch {}
    await rm(scratch, { recursive: true, force: true });
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}
try {
  preview = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--base', '/trial-questions/'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  preview.stdout.on('data', b => { previewLog += b; });
  preview.stderr.on('data', b => { previewLog += b; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (preview.exitCode !== null) throw new Error(`Vite preview failed: ${previewLog}`);
    // Wait for our own process's startup, not a pre-existing listener.
    if (previewLog.includes('Local:')) {
      try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch {}
    }
    await pause(100);
  }
  if (!ready) throw new Error('Vite preview did not start.');
  browser = await chromium.launch({ headless: true });
  for (let i = 0; i < SCENES.length; i++) {
    if (only !== null && only !== i + 1) continue;
    const spec = storyboard.scenes[i];
    console.log(`Recording ${spec.id} (${spec.duration}s)…`);
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', recordVideo: { dir: scratch, size: { width: 1920, height: 1080 } } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', response => {
      if (response.url().startsWith('https://clinicaltrials.gov/api/v2/')) requests.push({ url: response.url(), status: response.status(), retrievedAt: new Date().toISOString() });
    });
    // Read-only network guard: never call an AI provider or send a form externally.
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === new URL(baseURL).origin || (url.hostname === 'clinicaltrials.gov' && req.method() === 'GET' && url.pathname.startsWith('/api/v2/'))) return route.continue();
      return route.abort('blockedbyclient');
    });
    let nctId, duration, videoPath;
    try {
      await page.goto(baseURL);
      await page.getByRole('button', { name: 'Asthma', exact: false }).waitFor();
      await installPointer(page);
      nctId = await SCENES[i].prepare(page);
      await pause(700);
      await page.screenshot({ path: join(output, `${spec.id}_start.png`) });
      const started = performance.now();
      const at = async (seconds, action) => { await pause(Math.max(0, seconds * 1000 - (performance.now() - started))); await action(); };
      await SCENES[i].play(page, at);
      const afterAction = performance.now();
      await pause(Math.max(2000, spec.duration * 1000 - (afterAction - started)));
      duration = (performance.now() - started) / 1000;
      await page.screenshot({ path: join(output, `${spec.id}_end.png`) });
      if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
      if (i > 0 && !requests.some(r => r.status === 200)) throw new Error('No successful live API response was recorded.');
      if (i === 1) {
        const ids = await page.locator('.trial-card .trial-top').allInnerTexts();
        nctId = ids[0]?.match(/NCT\d{8}/)?.[0];
      }
      // Include screenshot overhead in the cut's end alignment, preserving the opening.
      duration = (performance.now() - started) / 1000;
      videoPath = await page.video().path();
    } finally { await context.close(); }
    const target = Math.max(spec.duration, Math.round(duration));
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-sseof', String(-duration), '-i', videoPath, '-an', '-vf', `fps=30,scale=1920:1080:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=2,trim=duration=${target},setpts=PTS-STARTPTS`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-fps_mode', 'cfr', '-t', String(target), '-threads', '4', '-movflags', '+faststart', join(output, `${spec.id}.mp4`)]);
    const checked = spawnSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', join(output, `${spec.id}.mp4`)], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error('ffprobe could not verify the scene.');
    const media = JSON.parse(checked.stdout), v = media.streams.find(s => s.codec_type === 'video');
    if (!v || v.codec_name !== 'h264' || v.width !== 1920 || v.height !== 1080 || v.avg_frame_rate !== '30/1' || media.streams.some(s => s.codec_type === 'audio') || Math.abs(Number(media.format.duration) - target) > 0.04) throw new Error('Scene does not meet the delivery format.');
    records.push({ scene: spec.id, duration: target, nctId, requests, patientInputs: i === 2 ? 'Fictional age 54, visibly labelled; sex not provided; no notes.' : 'none', aiCalls: 0 });
    await writeFile(join(output, `${spec.id}_capture.json`), JSON.stringify(records.at(-1), null, 2) + '\n');
    console.log(`Finished ${spec.id}: ${target}s`);
  }
  const allRecords = [];
  for (const scene of storyboard.scenes) {
    try { allRecords.push(JSON.parse(await readFile(join(output, `${scene.id}_capture.json`), 'utf8'))); } catch {}
  }
  await writeFile(join(output, 'capture-metadata.json'), JSON.stringify({ capturedAt: new Date().toISOString(), browser: browser.version(), resolution: '1920x1080', fps: 30, codec: 'H.264', audio: false, api: 'Live ClinicalTrials.gov API; no mocks or replay', scenes: allRecords }, null, 2) + '\n');
} finally {
  await browser?.close();
  if (preview && preview.exitCode === null) {
    preview.kill('SIGTERM');
    await Promise.race([new Promise(r => preview.once('exit', r)), pause(3000)]);
    if (preview.exitCode === null) preview.kill('SIGKILL');
  }
  await rm(scratch, { recursive: true, force: true });
}

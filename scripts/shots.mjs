// 개발 서버 화면을 Edge로 열어 캡처한다 (레이아웃 확인용)
// 사용: node scripts/shots.mjs <출력폴더> [이름...]
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BASE || 'https://localhost:5173/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const out = process.argv[2] || 'shots';
const only = process.argv.slice(3);

const phone = { width: 430, height: 860, deviceScaleFactor: 2 };
const sheet = { width: 1800, height: 1200 };
const active = (name) => `.screen.active[data-screen="${name}"]`;

const pages = [
  { name: 'booth', q: '', vp: phone, wait: active('booth') },
  { name: 'camera', q: '?screen=camera&type=resume', vp: phone, wait: active('camera'), delay: 2500 },
  { name: 'processing', q: '?screen=camera&type=resume', vp: phone, wait: active('camera'), delay: 2500, click: '#btnShutter', after: 4300 },
  { name: 'select', q: '?screen=select&type=passport', vp: phone, wait: active('select') },
  { name: 'tray', q: '?screen=tray&type=resume', vp: phone, wait: active('tray'), delay: 1800 },
  { name: 'result', q: '?screen=result&type=license', vp: phone, wait: active('result'), delay: 500 },
  { name: 'retro', q: '?screen=retro', vp: { width: 1600, height: 1000 }, wait: '#done' },
  ...['resume', 'license', 'passport', 'large'].map((t) => ({ name: `sheet-${t}`, q: `?screen=sheet&type=${t}`, vp: sheet, wait: 'body > canvas' })),
];

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--ignore-certificate-errors', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
for (const p of pages) {
  if (only.length && !only.includes(p.name)) continue;
  const page = await browser.newPage();
  await page.setViewport(p.vp);
  page.on('console', (m) => m.type() === 'error' && console.log(`  [${p.name}] console: ${m.text()}`));
  page.on('pageerror', (e) => console.log(`  [${p.name}] error: ${e.message}`));
  try {
    await page.goto(BASE + p.q, { waitUntil: 'networkidle2' });
    await page.waitForSelector(p.wait, { timeout: 60000 });
    if (p.delay) await new Promise((r) => setTimeout(r, p.delay));
    if (p.click) {
      await page.click(p.click);
      await new Promise((r) => setTimeout(r, p.after || 0));
    }
    await page.screenshot({ path: `${out}/${p.name}.png` });
    console.log(`${p.name} ok`);
  } catch (err) {
    console.log(`${p.name} FAIL ${err.message}`);
  }
  await page.close();
}
await browser.close();

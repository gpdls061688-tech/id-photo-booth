// 일본 무인 증명사진기 인화 시트 (6×4인치, DPI 기준 실제 크기)
// 모눈·재단선·안내문을 그린 뒤 인화물 질감을 입힌다. 위치에 아주 작은 오차를 일부러 넣는다.
import { DPI, SHEET, SPECS, TYPES, mmToPx } from './specs.js';
import { printTexture, rng } from './retro.js';

const FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
const P = (mm) => (mm / 25.4) * DPI; // mm → px (소수)

const COLORS = {
  paper: '#f3f2ec',
  gridBg: '#fbfaf5',
  minor: 'rgba(150,165,178,',
  mid: 'rgba(110,125,140,',
  major: 'rgba(80,92,106,',
  mark: '#1f2730',
  cut: 'rgba(45,55,65,0.55)',
  title: '#222',
  red: '#a8282c',
  blue: '#2f64a0',
  tab: '#3d6a93',
  sticker: '#f1d64a',
  gray: '#d3d7db',
};

async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load(`700 40px ${FONT}`, '履歴書'),
      document.fonts.load(`400 40px ${FONT}`, 'ご利用'),
    ]);
  } catch {
    // 오프라인이면 시스템 글꼴 사용
  }
}

function drawGrid(ctx, jit) {
  const x0 = SHEET.gridInset;
  const y0 = SHEET.gridInset;
  const x1 = Math.floor(SHEET.w - SHEET.gridInset);
  const y1 = Math.floor(SHEET.h - SHEET.gridInset);
  ctx.fillStyle = COLORS.gridBg;
  ctx.fillRect(P(x0), P(y0), P(x1 - x0), P(y1 - y0));

  // 선마다 진하기·위치가 아주 조금씩 다르게 (인쇄된 모눈 느낌)
  const line = (ax, ay, bx, by, color, width) => {
    ctx.strokeStyle = `${color}${(0.72 + jit.rand() * 0.28).toFixed(2)})`;
    ctx.lineWidth = P(width);
    const o = jit.d(0.03);
    ctx.beginPath();
    ctx.moveTo(P(ax + o), P(ay + o));
    ctx.lineTo(P(bx + o), P(by + o));
    ctx.stroke();
  };
  const style = (i) => (i % 10 === 0 ? [COLORS.major, 0.17] : i % 5 === 0 ? [COLORS.mid, 0.12] : [COLORS.minor, 0.06]);
  for (const pass of [1, 5, 10]) {
    for (let x = x0; x <= x1; x++) {
      const i = x - x0;
      if ((pass === 1 && i % 5) || (pass === 5 && i % 5 === 0 && i % 10) || (pass === 10 && i % 10 === 0)) line(x, y0, x, y1, ...style(i));
    }
    for (let y = y0; y <= y1; y++) {
      const i = y - y0;
      if ((pass === 1 && i % 5) || (pass === 5 && i % 5 === 0 && i % 10) || (pass === 10 && i % 10 === 0)) line(x0, y, x1, y, ...style(i));
    }
  }
  ctx.strokeStyle = `${COLORS.major}0.9)`;
  ctx.lineWidth = P(0.17);
  ctx.strokeRect(P(x0), P(y0), P(x1 - x0), P(y1 - y0));
}

/** 삼각형 재단 표시. dir: 1=아래를 가리킴, -1=위를 가리킴. tipY는 꼭짓점 */
function triangle(ctx, x, tipY, dir) {
  const hw = 0.75;
  const h = 1.3;
  ctx.fillStyle = COLORS.mark;
  ctx.beginPath();
  ctx.moveTo(P(x), P(tipY));
  ctx.lineTo(P(x - hw), P(tipY - dir * h));
  ctx.lineTo(P(x + hw), P(tipY - dir * h));
  ctx.closePath();
  ctx.fill();
}

/** 가로 폭에 맞을 때까지 글자 크기를 줄인다 */
function fitFont(ctx, text, weight, sizeMm, maxWidthMm) {
  let size = sizeMm;
  for (;;) {
    ctx.font = `${weight} ${P(size)}px ${FONT}`;
    if (ctx.measureText(text).width <= P(maxWidthMm) || size < 1.2) return size;
    size *= 0.94;
  }
}

/** 글자 뒤에 종이색 바탕을 깔아 모눈 위에서도 읽히게 한다. 차지한 영역(mm)을 반환 */
function label(ctx, text, x, y, color) {
  const w = ctx.measureText(text).width;
  const m = ctx.measureText('国');
  const asc = m.actualBoundingBoxAscent || P(1.6);
  const desc = m.actualBoundingBoxDescent || P(0.4);
  const rect = { x0: P(x) - P(0.4), y0: P(y) - asc - P(0.3), x1: P(x) + w + P(0.4), y1: P(y) + desc + P(0.3) };
  ctx.fillStyle = COLORS.gridBg;
  ctx.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
  ctx.fillStyle = color;
  ctx.fillText(text, P(x), P(y));
  const mm = (v) => (v / DPI) * 25.4;
  return { x0: mm(rect.x0), y0: mm(rect.y0), x1: mm(rect.x1), y1: mm(rect.y1) };
}

// 세로쓰기에서 90° 돌려 쓰는 문자와 오른쪽 위로 옮기는 문장부호
const ROTATE = new Set([...'ー－—―〜～…‥（）()「」『』【】-']);
const PUNCT = new Set([...'、。，．']);

/** 세로쓰기(글자는 똑바로, 위→아래). 끝난 위치(mm)를 반환 */
function tategaki(ctx, text, cx, top, size, color, weight = 400) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${P(size)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = top + size / 2;
  for (const ch of text) {
    if (ch === ' ' || ch === '　') {
      y += size * 0.6;
      continue;
    }
    if (ROTATE.has(ch)) {
      ctx.save();
      ctx.translate(P(cx), P(y));
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    } else if (PUNCT.has(ch)) {
      ctx.fillText(ch, P(cx + size * 0.55), P(y - size * 0.55));
    } else {
      ctx.fillText(ch, P(cx), P(y));
    }
    y += size * 1.06;
  }
  ctx.restore();
  return y;
}

/** 가로 글자를 시계 방향 90°로 돌려 위→아래로 읽히게 쓴다 (숫자·날짜용) */
function rotatedText(ctx, text, cx, top, size, color, weight = 400) {
  ctx.save();
  ctx.translate(P(cx), P(top));
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = color;
  ctx.font = `${weight} ${P(size)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function layout(type) {
  const rows = TYPES[type].rows.map((r) => {
    const s = SPECS[r.spec];
    return { ...r, s, w: r.count * s.w + (r.count - 1) * SHEET.gap, h: s.h };
  });
  const sumH = rows.reduce((a, r) => a + r.h, 0);
  const avail = SHEET.h - 2 * SHEET.gridInset;
  const band = Math.round(Math.max(5, Math.min(9, avail - sumH - 6)));
  const total = sumH + band;
  let y = Math.round((SHEET.h - total) / 2);
  const [ax0, ax1] = SHEET.photoArea;
  const placed = [];
  let bandY = 0;
  rows.forEach((r, i) => {
    const x = ax0 + Math.max(0, (ax1 - ax0 - r.w) / 2);
    const cells = [];
    for (let c = 0; c < r.count; c++) cells.push({ x: x + c * (r.s.w + SHEET.gap), y, w: r.s.w, h: r.s.h, spec: r.spec });
    placed.push({ ...r, x, y, cells });
    y += r.h;
    if (i === 0) {
      bandY = y;
      y += band;
    }
  });
  return { rows: placed, bandY, band };
}

/** 흰 재단 여백 + 사진 + 가장자리 절단선 */
function drawPhotos(ctx, rows, photos, jit) {
  ctx.fillStyle = '#ffffff';
  for (const r of rows) ctx.fillRect(P(r.x - 1), P(r.y - 0.25), P(r.w + 2), P(r.h + 0.5));
  for (const r of rows) {
    for (const c of r.cells) {
      ctx.drawImage(photos[c.spec], Math.round(P(c.x)), Math.round(P(c.y)), mmToPx(c.w), mmToPx(c.h));
    }
  }
  // 절단선은 사진 경계에 겹치거나 살짝 비껴 나가게
  ctx.strokeStyle = COLORS.cut;
  ctx.lineWidth = P(0.07);
  ctx.beginPath();
  for (const r of rows) {
    for (const c of r.cells) {
      for (const x of [c.x, c.x + c.w]) {
        const o = jit.d(0.08);
        ctx.moveTo(P(x + o), P(c.y - 1.8));
        ctx.lineTo(P(x + o), P(c.y + c.h + 1.8));
      }
      for (const y of [c.y, c.y + c.h]) {
        const o = jit.d(0.08);
        ctx.moveTo(P(c.x - 1.2), P(y + o));
        ctx.lineTo(P(c.x + c.w + 1.2), P(y + o));
      }
    }
  }
  ctx.stroke();
}

function drawBand(ctx, type, rows, bandY, band, jit) {
  const rects = [];
  drawBandText(ctx, type, bandY, band, (...args) => rects.push(label(...args)));

  // 재단 표시: 윗줄 아래 ▲, 아랫줄 위 ▼, 같은 열이면 세로선으로 연결. 글자와 겹치는 자리는 생략
  const free = (x, y0, y1) => !rects.some((r) => x > r.x0 - 1 && x < r.x1 + 1 && y1 > r.y0 && y0 < r.y1);
  const top = rows[0];
  const bottom = rows[1];
  ctx.strokeStyle = COLORS.mark;
  ctx.lineWidth = P(0.1);
  for (const c of top.cells) {
    const cx = c.x + c.w / 2 + jit.d(0.1);
    if (free(cx, bandY, bandY + 1.8)) triangle(ctx, cx, bandY + 0.5, -1);
    const aligned = bottom && bottom.cells.some((d) => Math.abs(d.x + d.w / 2 - (c.x + c.w / 2)) < 0.5);
    if (aligned && free(cx, bandY + 1.8, bandY + band - 1.8)) {
      ctx.beginPath();
      ctx.moveTo(P(cx), P(bandY + 1.8));
      ctx.lineTo(P(cx), P(bandY + band - 1.8));
      ctx.stroke();
    }
  }
  if (bottom) {
    for (const c of bottom.cells) {
      const cx = c.x + c.w / 2 + jit.d(0.1);
      if (free(cx, bandY + band - 1.8, bandY + band)) triangle(ctx, cx, bandY + band - 0.5, 1);
    }
  }
}

/** 가운데 띠의 안내 문구. put(ctx, text, x, y, color)로 그린다 */
function drawBandText(ctx, type, bandY, band, put) {
  const x0 = SHEET.photoArea[0] + 1;
  const maxW = SHEET.photoArea[1] - x0;
  const title = TYPES[type].title;
  const red = 'ご利用のサイズに合わせてカットしてご利用ください。';
  const blue = '※マス目は1ミリ間隔です。カットの目安にご利用ください。';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  if (band >= 8) {
    // 제목 왼쪽, 빨강/파랑 두 줄은 오른쪽
    fitFont(ctx, title, 700, 2.4, maxW * 0.46);
    const tw = ctx.measureText(title).width / P(1);
    put(ctx, title, x0, bandY + band / 2 + 0.9, COLORS.title);
    const rx = x0 + tw + 2.5;
    const rw = SHEET.photoArea[1] - rx;
    const size = Math.min(fitFont(ctx, red, 400, 2, rw), fitFont(ctx, blue, 400, 2, rw));
    ctx.font = `400 ${P(size)}px ${FONT}`;
    put(ctx, red, rx, bandY + band / 2 - 0.6, COLORS.red);
    put(ctx, blue, rx, bandY + band / 2 + 2.6, COLORS.blue);
  } else {
    // 띠가 좁으면 두 줄: 제목 + 빨강 / 파랑
    const line1 = `${title}　`;
    const size = fitFont(ctx, line1 + red, 700, 1.9, maxW);
    const tw = ctx.measureText(line1).width / P(1);
    put(ctx, line1, x0, bandY + band / 2 - 0.3, COLORS.title);
    ctx.font = `400 ${P(size)}px ${FONT}`;
    put(ctx, red, x0 + tw, bandY + band / 2 - 0.3, COLORS.red);
    put(ctx, blue, x0, bandY + band / 2 + size + 0.3, COLORS.blue);
  }
}

/** 손으로 붙인 듯 살짝 비뚤고 가장자리가 고르지 않은 사각형 */
function wobblyRect(ctx, x, y, w, h, jit, fill) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => [px + jit.d(0.12), py + jit.d(0.12)]);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(P(pts[0][0]), P(pts[0][1]));
  for (const [px, py] of pts.slice(1)) ctx.lineTo(P(px), P(py));
  ctx.closePath();
  ctx.fill();
}

/** 오른쪽 좁은 세로 안내 칸 */
function drawSide(ctx, { date, receipt }, jit) {
  const top = 4.5;

  // 작은 세로 안내문
  tategaki(ctx, 'カットしてご利用ください（写真用紙）', 133.7, top + 0.5, 1.45, '#3a4450');

  // 파란 탭: お問い合わせ先
  wobblyRect(ctx, 135.3, top, 4.2, 22.5, jit, COLORS.tab);
  tategaki(ctx, 'お問い合わせ先', 137.4, top + 1.6, 2.3, '#ffffff');

  // 노란 안내 스티커 (살짝 기울어진 오래된 스티커)
  ctx.save();
  ctx.translate(P(143.4), P(top + 17.5));
  ctx.rotate(0.008);
  ctx.translate(-P(143.4), -P(top + 17.5));
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = P(0.4);
  ctx.shadowOffsetY = P(0.15);
  wobblyRect(ctx, 140.2, top, 6.4, 35, jit, COLORS.sticker);
  ctx.shadowColor = 'transparent';
  tategaki(ctx, '写真のサイズに合わせて', 144.9, top + 2, 2.15, '#2a2a22', 500);
  tategaki(ctx, 'カットしてご利用ください。', 141.9, top + 2, 2.15, '#2a2a22', 500);
  ctx.restore();

  // 회색 탭
  wobblyRect(ctx, 147.2, top, 2.7, 35, jit, COLORS.gray);
  triangle(ctx, 148.55, top + 1.1, -1);
  triangle(ctx, 148.55, top + 34, 1);
  tategaki(ctx, '証明写真', 148.55, top + 11, 2.05, '#2f5b80', 700);

  // 흰 정보 상자: 날짜 / 요금 / 접수번호 (시계 방향으로 돌린 글자)
  const by = 45;
  const bh = 51.5;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(P(133), P(by), P(10.6), P(bh));
  ctx.strokeStyle = '#6b7279';
  ctx.lineWidth = P(0.16);
  ctx.strokeRect(P(133), P(by), P(10.6), P(bh));
  const d = `${date.getFullYear()}年 ${date.getMonth() + 1}月 ${date.getDate()}日`;
  rotatedText(ctx, d, 141.7, by + 2.5, 2.3, COLORS.title);
  rotatedText(ctx, `料金　${SHEET.price}`, 138.5, by + 2.5, 2.3, COLORS.title, 700);
  rotatedText(ctx, `受付番号　${receipt}`, 135.3, by + 2.5, 1.9, '#3a4450');

  // 파란 띠: 문의처
  wobblyRect(ctx, 144.6, by, 5, bh, jit, COLORS.tab);
  const size = fitFont(ctx, SHEET.contact, 400, 2.1, bh - 5);
  rotatedText(ctx, SHEET.contact, 147.1, by + 2.5, size, '#ffffff');
}

function hashSeed(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * photos: { specKey: canvas } — renderPhoto로 만든 DPI 기준 사진
 * info: { date, receipt } — 정보 상자에 들어갈 날짜와 접수번호
 */
export async function renderSheet(type, photos, { date = new Date(), receipt = 'XXXX-XXXX' } = {}) {
  await loadFonts();
  const rand = rng(hashSeed(receipt));
  const jit = { rand, d: (mm) => (rand() * 2 - 1) * mm };

  const canvas = document.createElement('canvas');
  canvas.width = mmToPx(SHEET.w);
  canvas.height = mmToPx(SHEET.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, jit);

  const { rows, bandY, band } = layout(type);
  drawPhotos(ctx, rows, photos, jit);

  // 사진 묶음 바깥쪽 재단 표시 (여백이 있을 때만)
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (first.y - SHEET.gridInset >= 3) {
    for (const c of first.cells) triangle(ctx, c.x + c.w / 2 + jit.d(0.1), first.y - 0.9, 1);
  }
  if (rows.length > 1 && SHEET.h - SHEET.gridInset - (last.y + last.h) >= 3) {
    for (const c of last.cells) triangle(ctx, c.x + c.w / 2 + jit.d(0.1), last.y + last.h + 0.9, -1);
  }

  drawBand(ctx, type, rows, bandY, band, jit);
  drawSide(ctx, { date, receipt }, jit);
  printTexture(canvas, 1, hashSeed(receipt) ^ 0x5bd1);
  return canvas;
}

// 얼굴 위치 측정 → 규격에 맞춘 자르기 영역 계산 → 배경색 위에 합성
// 원본 픽셀은 확대/축소와 이동만 하고, 모양은 바꾸지 않는다.
import { BG_COLOR, mmToPx } from './specs.js';
import { paintBackground, digicamGrade, jpegRoundTrip } from './retro.js';

// 옛 디지털 카메라 해상도: 촬영 프레임의 긴 변을 이 크기로 낮춘 것처럼 처리
const CAMERA_LONG_SIDE = 1280;
const MIN_CAMERA_PHOTO_H = 520; // 사진 영역이 이보다 작아지면 얼굴이 깨져 보이므로 하한

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** cutout의 일부 영역 알파값을 읽는다 */
function readAlpha(bitmap, x, y, w, h, scale = 1) {
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, cw, ch);
  return { data: ctx.getImageData(0, 0, cw, ch).data, w: cw, h: ch };
}

const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * 배경 제거 결과(cutout)의 빈틈을 사람 영역 마스크로 메운다.
 * 머리·머리카락(턱 위)은 섬세한 배경 제거 결과를 그대로 쓰고,
 * 턱 아래(목·어깨·옷)는 둘 중 하나라도 사람이라고 하면 남긴다 → 옷 색이 배경과 비슷해도 지워지지 않음.
 * 색은 원본 프레임 그대로 쓴다. 반환: 합쳐진 cutout ImageBitmap
 */
export async function mergePersonMask(frame, cutout, person, face) {
  const W = frame.width;
  const H = frame.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cutout, 0, 0, W, H);
  const alpha = ctx.getImageData(0, 0, W, H).data;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(frame, 0, 0);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;

  const { data: m, width: mw, height: mh } = person;
  const sx = mw / W;
  const sy = mh / H;

  // 보강 높이: 입 아래쯤부터 서서히 시작해 턱에서는 완전히 적용 (목이 비지 않도록)
  let y0;
  let y1;
  if (face) {
    const L = face.chin.y - face.forehead.y;
    y0 = face.chin.y - 0.3 * L;
    y1 = face.chin.y - 0.05 * L;
  } else {
    // 얼굴을 못 찾으면 사람 영역 위에서 35% 아래부터
    let top = mh;
    let bottom = 0;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x += 4) {
        if (m[y * mw + x] > 0.5) {
          if (y < top) top = y;
          bottom = y;
        }
      }
    }
    const t = top / sy;
    const h = (bottom - top) / sy;
    y0 = t + 0.3 * h;
    y1 = t + 0.4 * h;
  }

  for (let y = 0; y < H; y++) {
    const wy = smoothstep(y0, y1, y);
    const my = Math.min(mh - 1, Math.floor(y * sy)) * mw;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let a = alpha[i + 3];
      if (wy > 0) {
        // 경계를 살짝 안쪽으로(0.45~0.8) 잡아 배경이 테두리로 묻어나지 않게
        const p = smoothstep(0.45, 0.8, m[my + Math.min(mw - 1, Math.floor(x * sx))]) * 255 * wy;
        if (p > a) a = p;
      }
      d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return createImageBitmap(c);
}

/** 사람 영역(불투명 픽셀) 전체의 경계 상자. 얼굴을 못 찾았을 때만 사용 */
function alphaBBox(bitmap) {
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
  const { data, w, h } = readAlpha(bitmap, 0, 0, bitmap.width, bitmap.height, scale);
  let top = h, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return null;
  // 머리 중심은 윗부분 20% 구간의 가로 중심으로 추정
  const band = Math.max(1, Math.round((bottom - top) * 0.2));
  let bl = w, br = -1;
  for (let y = top; y < top + band; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 128) {
        if (x < bl) bl = x;
        if (x > br) br = x;
      }
    }
  }
  const s = 1 / scale;
  return { top: top * s, bottom: bottom * s, left: left * s, right: right * s, headCx: ((bl + br) / 2) * s };
}

/**
 * 머리 끝·턱·가로 중심을 원본 픽셀 좌표로 측정한다.
 * 턱과 얼굴 중심은 랜드마크, 머리 끝(머리카락 포함)은 배경 제거 알파에서 찾는다.
 */
export function measureHead(cutout, face) {
  const W = cutout.width;
  const H = cutout.height;

  if (!face) {
    const box = alphaBBox(cutout);
    if (!box) throw new Error('사진에서 사람을 찾지 못했어요. 다시 촬영해 주세요.');
    const head = Math.min((box.bottom - box.top) * 0.5, (box.right - box.left) * 0.6);
    return { cx: box.headCx, top: box.top, chin: box.top + head, roll: 0, faceFound: false, topClipped: box.top <= 1, srcW: W, srcH: H };
  }

  const L = face.chin.y - face.forehead.y; // 이마~턱
  const cx = (face.left.x + face.right.x) / 2;
  const x0 = clamp(Math.round(cx - face.width * 0.6), 0, W - 1);
  const x1 = clamp(Math.round(cx + face.width * 0.6), x0 + 1, W);
  const y0 = clamp(Math.round(face.forehead.y - L * 1.2), 0, H - 1);
  const y1 = clamp(Math.round(face.forehead.y), y0 + 1, H);

  const { data, w, h } = readAlpha(cutout, x0, y0, x1 - x0, y1 - y0);
  const need = Math.max(3, Math.round(w * 0.03)); // 잔머리 몇 가닥은 무시
  let row = -1;
  for (let y = 0; y < h && row < 0; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 128) n++;
    if (n >= need) row = y;
  }

  let top = row >= 0 ? y0 + row : face.forehead.y - 0.35 * L;
  // 분리 결과가 머리카락을 깎아 먹은 경우 대비: 두피는 최소한 이마 랜드마크보다 위
  top = Math.min(top, face.forehead.y - 0.2 * L);

  const [eL, eR] = face.eyeA.x < face.eyeB.x ? [face.eyeA, face.eyeB] : [face.eyeB, face.eyeA];
  const roll = (Math.atan2(eR.y - eL.y, eR.x - eL.x) * 180) / Math.PI;

  return {
    cx,
    top,
    chin: face.chin.y,
    roll,
    faceFound: true,
    faceCount: face.count,
    topClipped: row === 0 && y0 === 0,
    srcW: W,
    srcH: H,
  };
}

/** 규격에 맞춰 원본에서 잘라낼 영역(원본 픽셀 좌표). 영역이 원본 밖으로 나가도 된다 */
export function computeCrop(geo, spec) {
  const s = (geo.chin - geo.top) / spec.head; // 원본 px / mm
  const w = spec.w * s;
  const h = spec.h * s;
  return { x: geo.cx - w / 2, y: geo.top - spec.top * s, w, h };
}

function drawCutout(ctx, cutout, crop, k) {
  // 원본 밖 영역을 가리키는 drawImage 소스 사각형은 Safari에서 불안정하므로 변환 행렬로 그린다
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(k, 0, 0, k, -crop.x * k, -crop.y * k);
  ctx.drawImage(cutout, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/**
 * 배경 위에 사람(cutout)을 규격 위치에 그리고, 옛 디지털 카메라 화질로 만든다.
 * 1) 카메라 해상도로 합성 2) 바랜 색감·노이즈 3) JPEG 압축 4) 인화 해상도로 확대
 */
export async function renderPhoto(cutout, geo, spec, bg = BG_COLOR) {
  const crop = computeCrop(geo, spec);
  const W = mmToPx(spec.w);
  const H = mmToPx(spec.h);

  let kc = Math.min(1, CAMERA_LONG_SIDE / Math.max(geo.srcW, geo.srcH));
  kc = Math.min(1, Math.max(kc, MIN_CAMERA_PHOTO_H / crop.h));
  const cw = Math.max(1, Math.round(crop.w * kc));
  const ch = Math.max(1, Math.round(crop.h * kc));
  const k = cw / crop.w;

  const cam = document.createElement('canvas');
  cam.width = cw;
  cam.height = ch;
  const cctx = cam.getContext('2d', { willReadFrequently: true });
  paintBackground(cctx, cw, ch, bg);
  drawCutout(cctx, cutout, crop, k);

  // 인물 영역(알파) — 배경에 노이즈를 더 주기 위해
  const mask = document.createElement('canvas');
  mask.width = cw;
  mask.height = ch;
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  drawCutout(mctx, cutout, crop, k);
  const md = mctx.getImageData(0, 0, cw, ch).data;
  const alpha = new Uint8Array(cw * ch);
  for (let p = 0; p < alpha.length; p++) alpha[p] = md[p * 4 + 3];

  cctx.putImageData(digicamGrade(cctx.getImageData(0, 0, cw, ch), alpha), 0, 0);
  const jpeg = await jpegRoundTrip(cam, 0.8);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(jpeg, 0, 0, W, H);
  jpeg.close();
  return { canvas, crop, upscale: W / crop.w };
}

/** 촬영 상태에 대한 안내 문구 */
export function shotWarnings(geo, crop, upscale) {
  const out = [];
  if (!geo.faceFound) out.push('얼굴을 찾지 못해 대략적으로 맞췄어요.');
  if (geo.faceCount > 1) out.push('여러 사람이 보여요. 가장 큰 얼굴로 맞췄어요.');
  if (geo.topClipped) out.push('머리 윗부분이 화면 밖으로 나갔어요.');
  if (Math.abs(geo.roll) > 5) out.push(`고개가 ${Math.abs(geo.roll).toFixed(0)}° 기울어져 있어요.`);
  if (crop.y + crop.h > geo.srcH + 2) out.push('몸 아래쪽이 부족해요. 카메라에서 조금 떨어져 주세요.');
  if (upscale > 2.2) out.push('얼굴이 작게 찍혔어요. 조금 더 가까이 오면 선명해져요.');
  return out;
}

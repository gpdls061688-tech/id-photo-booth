// 개발 모드 전용: ?screen=select&type=resume 처럼 특정 화면으로 바로 이동해 레이아웃을 확인한다.
// 카메라 대신 가짜 인물 실루엣을 만들어 실제 정렬·합성 코드를 그대로 통과시킨다.
import { measureHead, renderPhoto, shotWarnings } from './align.js';
import { canvasToBlob } from './png.js';
import { SPECS, TYPES, specKeysOf } from './specs.js';

async function fakeShot(type, offsetX = 0) {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 960;
  const ctx = c.getContext('2d');
  const cx = 640 + offsetX;
  ctx.fillStyle = '#2b3a55'; // 상의
  ctx.beginPath();
  ctx.ellipse(cx, 960, 330, 260, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#e8c4a8'; // 목·얼굴
  ctx.fillRect(cx - 55, 560, 110, 150);
  ctx.beginPath();
  ctx.ellipse(cx, 450, 125, 160, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1d17'; // 머리카락
  ctx.beginPath();
  ctx.ellipse(cx, 360, 140, 110, 0, Math.PI, 0);
  ctx.fill();

  const cutoutBlob = await canvasToBlob(c);
  const cutout = await createImageBitmap(cutoutBlob);
  const geo = measureHead(cutout, null);
  const guideKey = TYPES[type].guide;
  const photos = {};
  let warnings = [];
  for (const key of specKeysOf(type)) {
    const r = await renderPhoto(cutout, geo, SPECS[key]);
    photos[key] = r.canvas;
    if (key === guideKey) warnings = shotWarnings(geo, r.crop, r.upscale);
  }
  cutout.close();
  const previewBlob = await canvasToBlob(photos[guideKey]);
  const url = URL.createObjectURL(cutoutBlob);
  return {
    originalBlob: cutoutBlob, cutoutBlob, previewBlob, photos, warnings,
    urls: { original: url, cutout: url, preview: URL.createObjectURL(previewBlob) },
  };
}

export async function devJump(params, app) {
  const screen = params.get('screen');
  app.state.type = params.get('type') || 'resume';
  if (screen === 'camera') return app.enterCamera();
  if (screen === 'retro') {
    // 화질 처리 전/후 비교: 디자인 그림 속 인물을 잘라 같은 처리를 적용
    const { digicamGrade, jpegRoundTrip } = await import('./retro.js');
    const img = new Image();
    img.src = '/design/11.png';
    await img.decode();
    const crop = { x: 114, y: 571, w: 498, h: 578 };
    const W = 945;
    const H = Math.round((W * crop.h) / crop.w);
    const before = document.createElement('canvas');
    before.width = W;
    before.height = H;
    before.getContext('2d').drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    const cam = document.createElement('canvas');
    cam.width = Math.round(crop.w * 0.9);
    cam.height = Math.round(crop.h * 0.9);
    const cctx = cam.getContext('2d', { willReadFrequently: true });
    cctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, cam.width, cam.height);
    cctx.putImageData(digicamGrade(cctx.getImageData(0, 0, cam.width, cam.height), null), 0, 0);
    const jpeg = await jpegRoundTrip(cam, 0.8);
    const after = document.createElement('canvas');
    after.width = W;
    after.height = H;
    const actx = after.getContext('2d');
    actx.imageSmoothingQuality = 'high';
    actx.drawImage(jpeg, 0, 0, W, H);
    document.body.innerHTML = '';
    document.body.style.cssText = 'display:block;overflow:auto;white-space:nowrap';
    for (const c of [before, after]) {
      c.style.cssText = 'width:790px;margin-right:8px;display:inline-block';
      document.body.append(c);
    }
    document.body.append(Object.assign(document.createElement('div'), { id: 'done' }));
    return;
  }
  if (screen === 'facetest') {
    // 얼굴 인식 모델 로딩 확인 (얼굴 없는 이미지 → null 이 정상)
    const { detectFace } = await import('./face.js');
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    c.getContext('2d').fillRect(0, 0, 640, 480);
    try {
      const r = await detectFace(c);
      document.title = `FACETEST OK ${JSON.stringify(r)}`;
    } catch (err) {
      document.title = `FACETEST FAIL ${err.message}`;
    }
    return;
  }
  if (screen === 'sheet') {
    // 인화지만 크게 보기
    const { renderSheet } = await import('./sheet.js');
    const shot = await fakeShot(app.state.type);
    const canvas = await renderSheet(app.state.type, shot.photos);
    document.body.innerHTML = '';
    document.body.style.overflow = 'auto';
    canvas.style.width = '100%';
    document.body.append(canvas);
    return;
  }
  if (['select', 'printing', 'tray', 'result'].includes(screen)) {
    const n = Number(params.get('shots') || 2);
    for (let i = 0; i < n; i++) app.state.shots.push(await fakeShot(app.state.type, i * 60));
    app.state.selected = n - 1;
    app.enterSelect();
    if (screen === 'select') return;
    await app.decide();
    if (screen === 'result') {
      app.fillResult();
      app.show('result');
    }
    return;
  }
  app.show(screen);
}

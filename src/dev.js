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
  if (screen === 'mergetest') {
    // 옷 보강 확인: 배경 제거가 셔츠를 지운 상황을 흉내 낸 뒤 사람 영역으로 메워지는지 본다
    const { segmentPerson, detectFace } = await import('./face.js');
    const { mergePersonMask } = await import('./align.js');
    const img = new Image();
    img.src = '/design/11.png';
    await img.decode();
    const frame = document.createElement('canvas');
    frame.width = 498;
    frame.height = 578;
    frame.getContext('2d').drawImage(img, 114, 571, 498, 578, 0, 0, 498, 578);
    const person = await segmentPerson(frame);
    const face = await detectFace(frame).catch(() => null);
    // 가짜 배경 제거 결과: 사람 영역 중 위쪽 60%만 남기고 셔츠는 지움
    const broken = document.createElement('canvas');
    broken.width = 498;
    broken.height = 578;
    const bctx = broken.getContext('2d');
    bctx.drawImage(frame, 0, 0);
    const bd = bctx.getImageData(0, 0, 498, 578);
    for (let y = 0; y < 578; y++) for (let x = 0; x < 498; x++) {
      const i = y * 498 + x;
      bd.data[i * 4 + 3] = y < 578 * 0.62 && person.data[i] > 0.5 ? 255 : 0;
    }
    bctx.putImageData(bd, 0, 0);
    const brokenBmp = await createImageBitmap(broken);
    const fixed = await mergePersonMask(frame, brokenBmp, person, face);
    const show = (bmp) => {
      const c = document.createElement('canvas');
      c.width = 498;
      c.height = 578;
      const x = c.getContext('2d');
      x.fillStyle = '#58b4d3';
      x.fillRect(0, 0, 498, 578);
      x.drawImage(bmp, 0, 0);
      c.style.cssText = 'width:480px;margin-right:8px;display:inline-block';
      return c;
    };
    document.title = `MERGE face=${face ? 'found' : 'none'}`;
    document.body.innerHTML = '';
    document.body.style.cssText = 'display:block;white-space:nowrap';
    document.body.append(show(brokenBmp), show(fixed), Object.assign(document.createElement('div'), { id: 'done' }));
    return;
  }
  if (screen === 'segtest') {
    // 사람 영역 모델 확인: 디자인 그림 속 인물(파란 배경 + 줄무늬 셔츠)에서 마스크를 시각화
    const { segmentPerson } = await import('./face.js');
    const img = new Image();
    img.src = '/design/11.png';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 498;
    c.height = 578;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 114, 571, 498, 578, 0, 0, 498, 578);
    const m = await segmentPerson(c);
    const at = (fx, fy) => m.data[Math.floor(fy * m.height) * m.width + Math.floor(fx * m.width)].toFixed(2);
    document.title = `SEG masks=${m.count} size=${m.width}x${m.height} face=${at(0.5, 0.45)} shirt=${at(0.5, 0.9)} bgCorner=${at(0.05, 0.1)}`;
    const v = document.createElement('canvas');
    v.width = m.width;
    v.height = m.height;
    const id = v.getContext('2d').createImageData(m.width, m.height);
    for (let i = 0; i < m.data.length; i++) {
      const g = Math.round(m.data[i] * 255);
      id.data.set([g, g, g, 255], i * 4);
    }
    v.getContext('2d').putImageData(id, 0, 0);
    document.body.innerHTML = '';
    document.body.style.cssText = 'display:block;white-space:nowrap';
    for (const el of [c, v]) {
      el.style.cssText = 'width:480px;margin-right:8px;display:inline-block';
      document.body.append(el);
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

import { preload, removeBackground } from '@imgly/background-removal';
import { startCamera, stopCamera, shouldMirror } from './camera.js';
import { captureFullFrame } from './capture.js';
import { initFace, detectFace, initSegmenter, segmentPerson } from './face.js';
import { measureHead, mergePersonMask, renderPhoto, shotWarnings } from './align.js';
import { renderSheet } from './sheet.js';
import { canvasToBlob, pngWithDpi, download } from './png.js';
import { printTexture } from './retro.js';
import { checkSupport, unsupportedMessage, isInAppBrowser } from './compat.js';
import { DPI, SPECS, TYPES, specKeysOf } from './specs.js';

// 배경 제거 모델. 모바일 메모리를 고려해 fp16 사용
const BG_REMOVAL_CONFIG = { model: 'isnet_fp16', output: { format: 'image/png' } };
const MAX_SHOTS = 2;        // 최초 촬영 + 다시 촬영 1회
const SELECT_SECONDS = 60;  // 사진 선택 제한 시간 (0이 되면 선택된 사진으로 결정)
const MIN_PRINT_MS = 2800;  // 인쇄 연출 최소 시간

const $ = (id) => document.getElementById(id);
const video = $('video');
const screens = Object.fromEntries([...document.querySelectorAll('.screen')].map((el) => [el.dataset.screen, el]));

const state = {
  screen: 'booth',
  type: null,
  shots: [],
  selected: 0,
  stream: null,
  busy: false,
  timer: null,
  result: null,
  session: 0,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 화면 전환 ----------

function show(name) {
  if (state.screen === 'select' && name !== 'select') stopTimer();
  state.screen = name;
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
  // 결과 화면은 그림 속 '最初に戻る' 버튼을 쓴다
  $('btnHome').hidden = ['booth', 'printing', 'result'].includes(name);
}

let warmed = false;
// 서비스 선택 화면부터 모델을 미리 받아 두면 촬영 후 대기가 짧아진다
function warmUp() {
  if (warmed) return;
  warmed = true;
  preload(BG_REMOVAL_CONFIG).catch((err) => console.warn('배경 제거 모델 사전 로딩 실패', err));
  initFace().catch((err) => console.warn('얼굴 인식 모델 사전 로딩 실패', err));
  initSegmenter().catch((err) => console.warn('사람 영역 모델 사전 로딩 실패', err));
}

document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const to = btn.dataset.go;
    if (to === 'service') {
      // 촬영까지 다 한 뒤에 실패하지 않도록, 시작할 때 기기 지원 여부부터 확인
      const support = checkSupport();
      if (!support.ok) {
        console.warn('지원하지 않는 기능:', support.missing);
        $('noticeMsg').textContent = unsupportedMessage(support);
        $('notice').hidden = false;
        return;
      }
      warmUp();
    }
    show(to);
  });
});

$('btnNoticeClose').addEventListener('click', () => {
  $('notice').hidden = true;
});
$('inAppNotice').hidden = !isInAppBrowser;

document.querySelectorAll('[data-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.type = btn.dataset.type;
    resetShots();
    enterCamera();
  });
});

// ---------- 촬영 ----------

function setupGuide() {
  const spec = SPECS[TYPES[state.type].guide];
  $('specFrame').style.aspectRatio = `${spec.w} / ${spec.h}`;
  const faceTop = spec.top + spec.head * 0.2; // 헤어라인 근처
  const chin = spec.top + spec.head;
  const sw = spec.h * 0.009;
  const fs = spec.h * 0.055;
  const svg = $('guideSvg');
  svg.setAttribute('viewBox', `0 0 ${spec.w} ${spec.h}`);
  svg.innerHTML = `
    <ellipse cx="${spec.w / 2}" cy="${(faceTop + chin) / 2}" rx="${spec.head * 0.31}" ry="${(chin - faceTop) / 2}"
      fill="none" stroke="#fff" stroke-width="${sw}" stroke-dasharray="${sw * 4} ${sw * 3}" />
    <line x1="${spec.w * 0.12}" x2="${spec.w * 0.88}" y1="${spec.top}" y2="${spec.top}" stroke="#ffd400" stroke-width="${sw}" />
    <text x="${spec.w * 0.13}" y="${spec.top - fs * 0.3}" fill="#ffd400" font-size="${fs}">머리 끝</text>
    <line x1="${spec.w * 0.12}" x2="${spec.w * 0.88}" y1="${chin}" y2="${chin}" stroke="#ffd400" stroke-width="${sw}" />
    <text x="${spec.w * 0.13}" y="${chin + fs * 1.1}" fill="#ffd400" font-size="${fs}">턱</text>`;
}

function camOverlay(msg, { spinner = false, retry = false } = {}) {
  const box = $('camOverlay');
  if (!msg) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $('camOverlayMsg').innerHTML = (spinner ? '<span class="spinner"></span><br>' : '') + escapeHtml(msg);
  $('btnCamRetry').hidden = !retry;
}

/** 화면이 실제로 한 번 그려질 때까지 기다린다 (무거운 계산 전에 안내를 먼저 보여주기 위해) */
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

function showProcessing(msg) {
  const box = $('camProcessing');
  const bar = box.querySelector('.proc-bar i');
  bar.style.cssText = '';
  $('procMsg').textContent = msg;
  box.hidden = false;
  box.closest('.monitor').classList.add('processing');
  $('camTitle').textContent = 'しばらくお待ちください。';
}

function setProcMsg(msg) {
  $('procMsg').textContent = msg;
}

/** 진행 막대를 지금 위치에서 끝까지 채운다 */
async function finishProcessing() {
  const bar = $('camProcessing').querySelector('.proc-bar i');
  const now = getComputedStyle(bar).transform;
  bar.style.animation = 'none';
  bar.style.transform = now === 'none' ? 'scaleX(0)' : now;
  void bar.offsetWidth;
  bar.style.transition = 'transform .3s ease-out';
  bar.style.transform = 'scaleX(1)';
  await sleep(380);
}

function hideProcessing() {
  const box = $('camProcessing');
  box.hidden = true;
  box.closest('.monitor').classList.remove('processing');
  $('camTitle').textContent = 'カメラを見てください。';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function enterCamera() {
  setupGuide();
  $('shotCount').textContent = `${state.shots.length + 1}/${MAX_SHOTS}`;
  show('camera');
  if (state.stream && state.stream.active) {
    camOverlay(null);
    $('btnShutter').disabled = false;
    await video.play().catch(() => {});
  } else {
    await openCamera();
  }
}

async function openCamera() {
  $('btnShutter').disabled = true;
  camOverlay('카메라를 켜는 중…\n권한 요청이 뜨면 "허용"을 눌러 주세요.', { spinner: true });
  try {
    state.stream = await startCamera(video);
    video.classList.toggle('mirror', shouldMirror(state.stream));
    state.stream.getVideoTracks()[0].addEventListener('ended', onCameraEnded);
    camOverlay(null);
    $('btnShutter').disabled = false;
  } catch (err) {
    console.error(err);
    state.stream = null;
    camOverlay(err.message, { retry: true });
  }
}

function onCameraEnded() {
  state.stream = null;
  if (state.screen === 'camera' && !state.busy) {
    $('btnShutter').disabled = true;
    camOverlay('카메라 연결이 끊겼어요.', { retry: true });
  }
}

function closeCamera() {
  hideProcessing();
  stopCamera(video);
  state.stream = null;
}

// iOS Safari는 앱 전환 후 돌아오면 영상이 멈춰 있을 수 있다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.screen === 'camera' && state.stream && !state.busy && video.paused) {
    video.play().catch(() => {});
  }
});

async function shoot() {
  if (state.busy || !state.stream) return;
  state.busy = true;
  $('btnShutter').disabled = true;
  $('btnBackTypes').disabled = true;
  const cd = $('countdown');
  try {
    cd.hidden = false;
    cd.classList.remove('small');
    for (const n of ['3', '2', '1']) {
      cd.textContent = n;
      await sleep(1000);
    }
    cd.textContent = '찰칵!';
    cd.classList.add('small');

    if (!state.stream || !video.videoWidth) throw new Error('카메라 연결이 끊겼어요.');
    const frame = captureFullFrame(video, video.classList.contains('mirror'));
    video.pause();
    const flash = $('flash');
    flash.classList.remove('on');
    void flash.offsetWidth;
    flash.classList.add('on');
    await sleep(450);
    cd.hidden = true;

    // 멈춘 사진 위에 처리 카드를 먼저 그린 다음 계산을 시작한다
    showProcessing('사진을 만드는 중…');
    await nextPaint();
    const session = state.session;
    const shot = await buildShot(frame, setProcMsg);
    if (session !== state.session) {
      // 처리 중에 처음으로/규격 변경을 누른 경우 결과를 버린다
      Object.values(shot.urls).forEach((u) => URL.revokeObjectURL(u));
      hideProcessing();
      return;
    }
    state.shots.push(shot);
    state.selected = state.shots.length - 1;
    await finishProcessing();
    enterSelect();
    hideProcessing();
  } catch (err) {
    console.error(err);
    cd.hidden = true;
    hideProcessing();
    camOverlay(`${err.message || err}\n다시 촬영해 주세요.`);
    await sleep(2200);
    camOverlay(null);
    if (state.stream) {
      await video.play().catch(() => {});
      $('btnShutter').disabled = false;
    } else {
      camOverlay('카메라 연결이 끊겼어요.', { retry: true });
    }
  } finally {
    state.busy = false;
    $('btnBackTypes').disabled = false;
  }
}

/** 촬영 프레임 → 배경 제거(+ 사람 영역으로 옷 보강) + 얼굴 측정 → 규격별 사진 */
async function buildShot(frame, onProgress) {
  const originalBlob = await canvasToBlob(frame);
  const facePromise = detectFace(frame).catch((err) => {
    console.warn('얼굴 인식 실패', err);
    return null;
  });
  const personPromise = segmentPerson(frame).catch((err) => {
    console.warn('사람 영역 인식 실패', err);
    return null;
  });
  const cutoutBlob = await removeBackground(originalBlob, {
    ...BG_REMOVAL_CONFIG,
    progress: (key, current, total) => {
      if (key.startsWith('fetch')) {
        const pct = total ? Math.round((current / total) * 100) : 0;
        onProgress(`배경 제거 모델 준비 중… ${pct}%\n(처음 한 번만 걸려요)`);
      } else {
        onProgress('사람과 배경을 분리하는 중…');
      }
    },
  });
  onProgress('얼굴 위치를 규격에 맞추는 중…');
  await nextPaint();
  const face = await facePromise;
  const person = await personPromise;
  let cutout = await createImageBitmap(cutoutBlob);
  if (person) {
    const merged = await mergePersonMask(frame, cutout, person, face);
    cutout.close();
    cutout = merged;
  }
  try {
    const geo = measureHead(cutout, face);
    const guideKey = TYPES[state.type].guide;
    const photos = {};
    let warnings = [];
    for (const key of specKeysOf(state.type)) {
      const r = await renderPhoto(cutout, geo, SPECS[key]);
      photos[key] = r.canvas;
      if (key === guideKey) warnings = shotWarnings(geo, r.crop, r.upscale);
    }
    const previewBlob = await canvasToBlob(photos[guideKey]);
    return {
      originalBlob,
      cutoutBlob,
      previewBlob,
      photos,
      warnings,
      urls: {
        original: URL.createObjectURL(originalBlob),
        cutout: URL.createObjectURL(cutoutBlob),
        preview: URL.createObjectURL(previewBlob),
      },
    };
  } finally {
    cutout.close();
  }
}

// ---------- 사진 선택 ----------

function renderSelect() {
  document.querySelectorAll('.slot').forEach((slot) => {
    const i = Number(slot.dataset.slot);
    const shot = state.shots[i];
    slot.classList.toggle('empty', !shot);
    slot.classList.toggle('selected', !!shot && i === state.selected);
    slot.disabled = !shot;
    const img = slot.querySelector('img');
    if (shot) img.src = shot.urls.preview;
    else img.removeAttribute('src');
  });
  const shot = state.shots[state.selected];
  $('previewImg').src = shot.urls.preview;
  const remaining = MAX_SHOTS - state.shots.length;
  $('retakeCount').textContent = remaining;
  $('retakeOff').hidden = remaining > 0;
  $('btnRetake').disabled = remaining <= 0;
  $('warnings').innerHTML = shot.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('');
}

function enterSelect() {
  renderSelect();
  show('select');
  startTimer();
}

function startTimer() {
  stopTimer();
  let left = SELECT_SECONDS;
  $('timer').textContent = left;
  state.timer = setInterval(() => {
    left -= 1;
    $('timer').textContent = Math.max(0, left);
    if (left <= 0) decide();
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timer);
  state.timer = null;
}

document.querySelectorAll('.slot').forEach((slot) => {
  slot.addEventListener('click', () => {
    const i = Number(slot.dataset.slot);
    if (!state.shots[i]) return;
    state.selected = i;
    renderSelect();
  });
});

$('btnRetake').addEventListener('click', () => {
  if (state.shots.length >= MAX_SHOTS) return;
  stopTimer();
  enterCamera();
});

// ---------- 인쇄 → 受取口 → 결과 ----------

async function decide() {
  if (state.screen !== 'select') return;
  stopTimer();
  closeCamera();
  show('printing');
  const started = performance.now();
  const shot = state.shots[state.selected];
  try {
    const no = nextReceiptNo();
    const date = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const receipt = `${p2(date.getMonth() + 1)}${p2(date.getDate())}-${String(no).padStart(4, '0')}`;
    const sheetCanvas = await renderSheet(state.type, shot.photos, { date, receipt });
    const sheetBlob = await pngWithDpi(await canvasToBlob(sheetCanvas), DPI);

    // 사진 1장도 인화지보다 약하게 인화 질감을 입힌다
    const src = shot.photos[TYPES[state.type].guide];
    const single = document.createElement('canvas');
    single.width = src.width;
    single.height = src.height;
    single.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
    printTexture(single, 0.5, no);
    const photoBlob = await pngWithDpi(await canvasToBlob(single), DPI);

    if (state.result) URL.revokeObjectURL(state.result.sheetUrl);
    state.result = { sheetBlob, photoBlob, sheetUrl: URL.createObjectURL(sheetBlob), no, date };
  } catch (err) {
    console.error(err);
    alert(`인화지를 만들지 못했어요: ${err.message || err}`);
    enterSelect();
    return;
  }
  await sleep(Math.max(0, MIN_PRINT_MS - (performance.now() - started)));
  enterTray();
}

$('btnDecide').addEventListener('click', decide);

function enterTray() {
  const img = $('traySheet');
  img.classList.remove('drop');
  img.src = state.result.sheetUrl;
  show('tray');
  void img.offsetWidth;
  img.classList.add('drop');
}

// 受取口 터치 → 결과 화면 (data-go="result"에 추가로 내용 채우기)
screens.tray.querySelector('[data-go="result"]').addEventListener('click', fillResult);

function fillResult() {
  const r = state.result;
  if (!r) return;
  const p2 = (n) => String(n).padStart(2, '0');
  $('resultSheet').src = r.sheetUrl;
  $('resultNo').textContent = `No. ${String(r.no).padStart(6, '0')}`;
  $('resultDate').textContent = `${r.date.getFullYear()}.${p2(r.date.getMonth() + 1)}.${p2(r.date.getDate())}`;
}

/** 접수번호: 기기(브라우저)마다 1씩 올라가는 번호. 저장이 막혀 있으면 임의 번호 */
function nextReceiptNo() {
  try {
    const n = (Number(localStorage.getItem('idphoto.no')) || 127) + 1;
    localStorage.setItem('idphoto.no', String(n));
    return n;
  } catch {
    return 128 + Math.floor(Math.random() * 800);
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

$('btnSaveSheet').addEventListener('click', () => state.result && download(state.result.sheetBlob, `id-photo-sheet-${stamp()}.png`));
$('btnSavePhoto').addEventListener('click', () => state.result && download(state.result.photoBlob, `id-photo-${state.type}-${stamp()}.png`));

// ---------- 처음으로 ----------

function resetShots() {
  state.session += 1;
  for (const s of state.shots) Object.values(s.urls).forEach((u) => URL.revokeObjectURL(u));
  state.shots = [];
  state.selected = 0;
}

function goHome() {
  stopTimer();
  closeCamera();
  resetShots();
  state.type = null;
  show('booth');
}

$('btnHome').addEventListener('click', goHome);
$('btnRestart').addEventListener('click', goHome);
$('btnBackTypes').addEventListener('click', () => {
  closeCamera();
  resetShots();
  show('types');
});
$('btnShutter').addEventListener('click', shoot);
$('btnCamRetry').addEventListener('click', openCamera);

// 개발 모드: ?screen=select&type=passport 처럼 화면 바로 이동
if (import.meta.env.DEV) {
  const params = new URLSearchParams(location.search);
  if (params.has('screen')) {
    import('./dev.js').then((m) => m.devJump(params, { state, show, enterCamera, enterSelect, decide, fillResult }));
  }
}

// 카메라 시작/정지와 에러 메시지 처리

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
const isAndroid = /Android/.test(navigator.userAgent);
const isInAppBrowser = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\//i.test(navigator.userAgent);

export class CameraError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function getUserMedia(constraints) {
  return navigator.mediaDevices.getUserMedia(constraints);
}

/**
 * 전면 카메라를 켜서 video 요소에 연결한다.
 * iOS Safari: video에 playsinline + muted 가 있어야 전체화면 전환 없이 인라인 재생된다.
 */
export async function startCamera(video) {
  if (!window.isSecureContext) {
    throw new CameraError('insecure',
      '카메라는 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.\n' +
      '휴대폰에서 테스트한다면 `npm run dev:mobile`로 실행한 https:// 주소로 접속하세요.');
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new CameraError('unsupported',
      '이 브라우저는 카메라를 지원하지 않습니다.' +
      (isInAppBrowser ? '\n카카오톡·인스타그램 등 앱 안의 브라우저라면 Safari 또는 Chrome으로 열어주세요.' : ''));
  }

  const preferred = {
    audio: false,
    video: {
      facingMode: { ideal: 'user' }, // 모바일: 셀카 카메라, PC: 기본 웹캠
      width: { ideal: 1920 },        // 가능한 한 높은 해상도 요청 (다운로드 화질 확보)
      height: { ideal: 1080 },
    },
  };

  let stream;
  try {
    stream = await getUserMedia(preferred);
  } catch (err) {
    // 해상도 조건 때문에 실패하는 기기가 있어 최소 조건으로 한 번 더 시도
    if (err.name === 'OverconstrainedError' || err.name === 'NotFoundError') {
      try {
        stream = await getUserMedia({ audio: false, video: true });
      } catch (err2) {
        throw toCameraError(err2);
      }
    } else {
      throw toCameraError(err);
    }
  }

  video.muted = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.srcObject = stream;

  if (video.readyState < 1) {
    await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  await video.play();
  return stream;
}

export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

/** 전면 카메라(또는 방향 정보가 없는 PC 웹캠)면 거울처럼 좌우 반전해서 미리보기 */
export function shouldMirror(stream) {
  const track = stream.getVideoTracks()[0];
  const facing = track && track.getSettings().facingMode;
  return facing !== 'environment';
}

function permissionHelp() {
  if (isInAppBrowser) {
    return '카카오톡·인스타그램 등 앱 안의 브라우저는 카메라를 막는 경우가 많습니다. Safari 또는 Chrome으로 열어주세요.';
  }
  if (isIOS) {
    return '주소창의 "가가(aA)" 버튼 → 웹 사이트 설정 → 카메라 → "허용"으로 바꾼 뒤 새로고침하세요.\n' +
      '또는 설정 앱 → Safari → 카메라 → "허용"을 확인하세요.';
  }
  if (isAndroid) {
    return '주소창 왼쪽 아이콘 → 권한 → 카메라를 허용한 뒤 새로고침하세요.\n' +
      '그래도 안 되면 휴대폰 설정 → 앱 → Chrome → 권한 → 카메라를 확인하세요.';
  }
  return '주소창 왼쪽의 자물쇠(또는 설정) 아이콘 → 카메라 → "허용"으로 바꾼 뒤 새로고침하세요.';
}

function toCameraError(err) {
  switch (err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('denied', '카메라 권한이 거부되었습니다.\n' + permissionHelp());
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('notfound', '사용할 수 있는 카메라를 찾지 못했습니다. 카메라가 연결되어 있는지 확인하세요.');
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('busy', '카메라를 열 수 없습니다. 다른 앱(화상회의, 카메라 앱 등)이 카메라를 사용 중인지 확인하세요.');
    default:
      return new CameraError('unknown', `카메라를 시작하지 못했습니다. (${err.name}: ${err.message})`);
  }
}

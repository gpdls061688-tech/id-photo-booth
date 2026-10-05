// 기기·브라우저 지원 여부를 촬영 전에 미리 확인한다

// 아주 작은 SIMD 명령이 든 wasm 모듈 (wasm-feature-detect와 같은 방식)
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

export const isInAppBrowser = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\/|DaumApps|everytimeApp/i.test(navigator.userAgent);
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 촬영 흐름에 꼭 필요한 기능이 모두 있는지 */
export function checkSupport() {
  const missing = [];
  let simd = false;
  try {
    simd = typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_TEST);
  } catch {
    simd = false;
  }
  if (!simd) missing.push('wasm-simd');                         // 배경 제거 엔진 (iOS 16.4+, Chrome 91+)
  if (!window.CSS?.supports?.('container-type: inline-size')) missing.push('container-queries'); // 화면 배치 (iOS 16+, Chrome 105+)
  if (typeof createImageBitmap !== 'function') missing.push('createImageBitmap');
  if (!navigator.mediaDevices?.getUserMedia) missing.push('camera');
  return { ok: missing.length === 0, missing };
}

/** 지원하지 않을 때 보여줄 안내 문구 */
export function unsupportedMessage({ missing }) {
  if (isInAppBrowser) {
    return '앱 안의 브라우저에서는 촬영이 어려워요.\n오른쪽 위 메뉴(⋯)에서\n"Safari로 열기" 또는 "다른 브라우저로 열기"를 눌러 주세요.';
  }
  if (missing.includes('camera') && !window.isSecureContext) {
    return '보안 연결(https) 주소에서만 카메라를 쓸 수 있어요.';
  }
  if (isIOS) {
    return '이 기기의 iOS 버전에서는 사진 처리를 할 수 없어요.\n설정 → 일반 → 소프트웨어 업데이트에서\niOS 16.4 이상으로 업데이트한 뒤 Safari로 열어 주세요.';
  }
  return '이 브라우저에서는 사진 처리를 할 수 없어요.\n최신 Chrome 또는 삼성 인터넷으로 열어 주세요.';
}

// 카메라 프레임 캡처

/**
 * 현재 비디오 프레임 전체를 원본 해상도로 캡처한다.
 * 규격 자르기는 얼굴 위치를 찾은 뒤 하므로 여기서는 자르지 않는다.
 * mirror=true 면 미리보기(거울 모습)와 같게 좌우 반전해서 저장한다.
 */
export function captureFullFrame(video, mirror) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  return canvas;
}

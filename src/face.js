// MediaPipe Face Landmarker로 얼굴 위치만 측정한다. (얼굴 픽셀은 절대 변경하지 않음)
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarkerPromise = null;

export function initFace() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}mediapipe/face_landmarker.task`, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 3,
      });
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

/**
 * 이미지에서 가장 큰 얼굴의 주요 지점을 픽셀 좌표로 반환. 없으면 null.
 * 10: 이마 위, 152: 턱 끝, 234/454: 얼굴 좌우 끝, 33/263: 양쪽 눈 바깥
 */
export async function detectFace(source) {
  const landmarker = await initFace();
  const W = source.width;
  const H = source.height;
  const result = landmarker.detect(source);
  if (!result.faceLandmarks.length) return null;

  const faces = result.faceLandmarks.map((lm) => {
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
    const f = { forehead: P(10), chin: P(152), left: P(234), right: P(454), eyeA: P(33), eyeB: P(263) };
    f.width = Math.hypot(f.right.x - f.left.x, f.right.y - f.left.y);
    return f;
  });
  faces.sort((a, b) => b.width - a.width);
  return { ...faces[0], count: faces.length };
}

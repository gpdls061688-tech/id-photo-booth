// MediaPipe: 얼굴 위치 측정 + 사람(몸·옷) 영역 인식. 얼굴 픽셀은 절대 변경하지 않는다.
import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const base = import.meta.env.BASE_URL;
let filesetPromise = null;
let landmarkerPromise = null;
let segmenterPromise = null;

function fileset() {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`).catch((err) => {
      filesetPromise = null;
      throw err;
    });
  }
  return filesetPromise;
}

export function initSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => ImageSegmenter.createFromOptions(await fileset(), {
      baseOptions: { modelAssetPath: `${base}mediapipe/selfie_segmenter.tflite`, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }))().catch((err) => {
      segmenterPromise = null;
      throw err;
    });
  }
  return segmenterPromise;
}

/**
 * 사람일 확률 마스크 (0~1). 화상회의 배경 흐림용 모델이라 옷 색과 상관없이 몸통을 사람으로 본다.
 * 반환: { data: Float32Array, width, height }
 */
export async function segmentPerson(source) {
  const segmenter = await initSegmenter();
  const result = segmenter.segment(source);
  const masks = result.confidenceMasks || [];
  // selfie_segmenter는 마스크가 1장(사람 확률). 여러 장이면 0번이 배경이므로 뒤집는다
  const mask = masks[0];
  const raw = mask.getAsFloat32Array();
  const data = masks.length > 1 ? raw.map((v) => 1 - v) : Float32Array.from(raw);
  const out = { data, width: mask.width, height: mask.height, count: masks.length };
  masks.forEach((m) => m.close());
  return out;
}

export function initFace() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      return FaceLandmarker.createFromOptions(await fileset(), {
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

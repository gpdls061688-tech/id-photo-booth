// MediaPipe wasm·얼굴 모델을 public/mediapipe 로 준비한다 (빌드 전에 자동 실행)
// 원본 그림(design/)이 없는 배포 서버에서도 동작하도록 그림 변환과 분리했다.
import { mkdir, copyFile, readdir, writeFile, access } from 'node:fs/promises';

// wasm (버전 일치를 위해 node_modules에서 복사. ES 모듈 변형은 쓰지 않으므로 제외)
const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const WASM_DST = 'public/mediapipe/wasm';
await mkdir(WASM_DST, { recursive: true });
for (const f of await readdir(WASM_SRC)) {
  if (!f.includes('_module_')) await copyFile(`${WASM_SRC}/${f}`, `${WASM_DST}/${f}`);
}

// 얼굴 랜드마크 모델 (위치 측정용, 얼굴을 변형하지 않음)
const MODEL = 'public/mediapipe/face_landmarker.task';
try {
  await access(MODEL);
} catch {
  const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`모델 다운로드 실패: ${res.status}`);
  await writeFile(MODEL, Buffer.from(await res.arrayBuffer()));
}

console.log('runtime assets ready');

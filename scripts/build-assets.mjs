// design/ 원본 그림 → public/art 웹용 에셋 (원본 그림이 있는 PC에서만 실행)
// 실행: npm run assets  — 결과물(public/art)은 저장소에 포함한다
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const ART = 'public/art';
await mkdir(ART, { recursive: true });

const webp = (src, out, opts = {}) =>
  sharp(`design/${src}`).webp({ quality: 84, ...opts }).toFile(`${ART}/${out}`);

// 화면 전체 그림
await webp('7.png', 'booth.webp');      // 부스 외관
await webp('10.jpg', 'service.webp');   // 서비스 선택
await webp('5.png', 'types.webp');      // 규격 선택
await webp('6.png', 'machine.webp');    // 사진 선택 (촬영 화면 테두리로도 사용)
await webp('4.jpg', 'printing.webp');   // 인쇄 중
await webp('9.png', 'tray.webp');       // 受取口
await webp('11.png', 'result.webp');    // 결과 화면

// 결과 화면: 인화지 뒤 판(그림 속 인화지·패널을 덮는 바탕). 인화지 아래 빈 띠를 늘려서 사용
await sharp('design/11.png').extract({ left: 40, top: 1634, width: 1460, height: 92 })
  .webp({ quality: 88 }).toFile(`${ART}/result-mat.webp`);

// 6.png 화면 영역 좌상단 (237, 700) 기준으로 잘라낸 조각
const SX = 237, SY = 700;
const crop = (x, y, w, h, out) =>
  sharp('design/6.png').extract({ left: SX + x, top: SY + y, width: w, height: h })
    .webp({ quality: 90 }).toFile(`${ART}/${out}`);
await crop(0, 0, 190, 96, 'header.webp');          // 글자 없는 파란 헤더 띠
await crop(798, 670, 180, 180, 'btn-decide.webp'); // 결정 버튼 (촬영 버튼의 테두리로 재사용)

console.log('art ready');

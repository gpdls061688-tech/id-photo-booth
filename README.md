# 証明写真 — 셀프 증명사진 포토부스

일본 무인 증명사진기를 웹으로 옮긴 프로토타입입니다.
카메라 촬영 → 배경 제거 → 청록색 배경 → 규격에 맞춘 얼굴 자동 정렬 → 모눈종이 인화 시트(6×4인치, 600dpi) 저장.

- 모든 처리는 브라우저 안에서 이루어지며 사진을 서버로 보내지 않습니다.
- 얼굴 인식은 위치 측정에만 쓰고, 얼굴 모양을 바꾸지 않습니다.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:mobile   # https://<PC IP>:5173 (같은 와이파이의 휴대폰에서 테스트)
npm run build        # dist/ 에 배포용 파일 생성
```

## 지원 환경

iOS 16.4 이상 Safari, 최신 Chrome·삼성 인터넷·Edge (WebAssembly SIMD 필요).

## 라이선스

- 코드: [GNU AGPL v3](LICENSE.md) — 배경 제거에 사용하는 [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)이 AGPL이므로 같은 라이선스로 공개합니다.
- 일러스트(`public/art/`): 저작권자에게 모든 권리가 있으며 위 라이선스의 대상이 아닙니다.

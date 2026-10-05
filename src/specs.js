// 사진 규격과 인화지 레이아웃 정의 (단위: mm)

export const DPI = 600;                 // 출력 해상도
export const BG_COLOR = '#58B4D3';      // 증명사진 배경색
export const mmToPx = (mm) => Math.round((mm / 25.4) * DPI);

/**
 * 한 장의 사진 규격
 * head: 머리 끝(머리카락 포함)~턱 길이, top: 사진 윗변~머리 끝 여백
 */
export const SPECS = {
  resume:   { w: 30, h: 40, head: 26,   top: 4 },  // 이력서·기타 3.0×4.0
  license:  { w: 25, h: 30, head: 19.5, top: 3 },  // 운전면허 2.5×3.0
  medium:   { w: 50, h: 55, head: 33,   top: 6 },  // 중형 5.0×5.5
  passport: { w: 35, h: 45, head: 34,   top: 4 },  // 여권·재류카드 3.5×4.5
  large:    { w: 50, h: 70, head: 38,   top: 8 },  // 대형 5.0×7.0
};

/**
 * 규격 선택 화면의 4가지 종류.
 * guide: 촬영 가이드·미리보기에 쓰는 규격, rows: 인화지에 배치할 행
 */
export const TYPES = {
  resume: {
    guide: 'resume',
    title: '履歴書・その他証明用（縦4.0cm×横3.0cm）',
    rows: [{ spec: 'resume', count: 4 }, { spec: 'resume', count: 4 }],
  },
  license: {
    guide: 'license',
    title: '運転免許証・中型（縦3.0cm×横2.5cm／縦5.5cm×横5.0cm）',
    rows: [{ spec: 'medium', count: 2 }, { spec: 'license', count: 4 }],
  },
  passport: {
    guide: 'passport',
    title: 'パスポート・在留カード用（縦4.5cm×横3.5cm）',
    rows: [{ spec: 'passport', count: 3 }, { spec: 'passport', count: 3 }],
  },
  large: {
    guide: 'large',
    title: '大型（縦7.0cm×横5.0cm）',
    rows: [{ spec: 'large', count: 2 }],
  },
};

export const specKeysOf = (type) => [...new Set(TYPES[type].rows.map((r) => r.spec))];

/** 인화지: 6×4인치(KG) 가로 */
export const SHEET = {
  w: 152.4,
  h: 101.6,
  gridInset: 2,        // 모눈 영역 바깥 흰 여백
  gap: 2.5,            // 사진 사이 흰 재단 여백
  photoArea: [3, 131], // 사진 배치 가로 범위 (오른쪽은 세로 안내 칸)
  price: '￥1000',
  contact: 'お問い合わせ先　XXXX-XXX-XXX',
};

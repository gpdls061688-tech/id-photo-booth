// 2000~2010년대 디지털 카메라·무인 증명사진기 출력물 느낌.
// 얼굴 모양은 건드리지 않고, 화질(해상도·선명도·색·노이즈·압축)만 사진 전체에 고르게 바꾼다.

/** 시드 고정 난수 (같은 사진은 매번 같은 질감) */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 대략 정규분포 노이즈 (평균 0, 표준편차 ≈ 1) */
const gauss = (rand) => (rand() + rand() + rand() - 1.5) * 2;

/**
 * 증명사진 배경: 단색 대신 조명 낙차와 아주 약한 색 얼룩이 있는 바랜 청록색
 */
export function paintBackground(ctx, w, h, color, seed = 7) {
  const rand = rng(seed);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const R = Math.max(w, h);
  // 머리 뒤쪽이 살짝 밝고 모서리로 갈수록 어두운 스튜디오 조명
  let g = ctx.createRadialGradient(w * 0.5, h * 0.32, 0, w * 0.5, h * 0.32, R * 0.85);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(0,30,50,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // 큰 얼룩 몇 개
  for (let i = 0; i < 6; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = R * (0.25 + rand() * 0.4);
    g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() > 0.5 ? 'rgba(255,250,235,0.05)' : 'rgba(0,70,90,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * 옛 디지털 카메라 색감: 대비·채도 조금 낮춤, 검정이 살짝 뜨는 바랜 톤, 미세 노이즈.
 * personAlpha(0~255, 픽셀 수만큼)가 있으면 인물보다 배경에 노이즈를 더 준다.
 */
export function digicamGrade(imageData, personAlpha, seed = 11) {
  const d = imageData.data;
  const rand = rng(seed);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    // 대비 -6%
    r = (r - 128) * 0.94 + 128;
    g = (g - 128) * 0.94 + 128;
    b = (b - 128) * 0.94 + 128;
    // 채도 -10%
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * 0.9;
    g = l + (g - l) * 0.9;
    b = l + (b - l) * 0.9;
    // 바랜 톤: 검정 들뜸, 흰색 살짝 눌림
    r = r * 0.95 + 9;
    g = g * 0.95 + 9;
    b = b * 0.95 + 10;
    // 어두운 곳은 약간 푸르게, 밝은 곳은 약간 따뜻하게
    const t = l / 255 - 0.5;
    r += t * 4;
    b -= t * 3;
    // 노이즈: 인물 σ≈2.4, 배경 σ≈4.6
    const a = personAlpha ? personAlpha[p] / 255 : 0;
    const n = gauss(rand) * (4.6 - 2.2 * a);
    const c = gauss(rand) * 1.3;
    d[i] = r + n + c;
    d[i + 1] = g + n;
    d[i + 2] = b + n - c;
  }
  return imageData;
}

/**
 * 인화물 질감: 종이 얼룩, 프린터 가로 줄무늬, 미세 노이즈, 약한 잉크 번짐.
 * strength 1 = 인화지 전체, 0.5 = 사진 1장
 */
export function printTexture(canvas, strength = 1, seed = 23) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const rand = rng(seed);

  // 잉크 번짐: 반 해상도 사본을 살짝 겹쳐 선·글자 가장자리를 부드럽게
  const half = document.createElement('canvas');
  half.width = Math.max(1, Math.round(W / 2));
  half.height = Math.max(1, Math.round(H / 2));
  half.getContext('2d').drawImage(canvas, 0, 0, half.width, half.height);
  ctx.save();
  ctx.globalAlpha = 0.28 * strength;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(half, 0, 0, W, H);
  ctx.restore();

  // 저주파 얼룩 격자 (색 불균일)
  const cell = Math.max(24, Math.round(Math.max(W, H) / 40));
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const blot = new Float32Array(gw * gh);
  for (let i = 0; i < blot.length; i++) blot[i] = gauss(rand);

  // 프린터 헤드 줄무늬
  const band = new Float32Array(H);
  for (let y = 0; y < H; ) {
    const h = 4 + Math.floor(rand() * 14);
    const v = gauss(rand) * 0.9;
    for (let k = 0; k < h && y < H; k++, y++) band[y] = v;
  }

  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const sN = 3.2 * strength;
  const sB = 2.4 * strength;
  for (let y = 0; y < H; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    for (let x = 0; x < W; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const i0 = y0 * gw + x0;
      const bl = (blot[i0] * (1 - fx) + blot[i0 + 1] * fx) * (1 - fy) +
        (blot[i0 + gw] * (1 - fx) + blot[i0 + gw + 1] * fx) * fy;
      const base = bl * sB + band[y] * strength + gauss(rand) * sN;
      const i = (y * W + x) * 4;
      d[i] += base + bl * 0.6 * strength;     // 얼룩은 살짝 따뜻한 쪽으로
      d[i + 1] += base + bl * 0.3 * strength;
      d[i + 2] += base - bl * 0.2 * strength;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** JPEG로 한 번 저장했다 다시 읽어 미세한 압축감을 남긴다 */
export async function jpegRoundTrip(canvas, quality = 0.8) {
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG 변환 실패'))), 'image/jpeg', quality));
  return createImageBitmap(blob);
}

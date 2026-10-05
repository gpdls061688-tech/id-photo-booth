// PNG 저장 유틸: 인쇄 시 실제 크기로 나오도록 DPI(pHYs) 정보를 기록한다

export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 변환 실패'))), type);
  });
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** PNG에 pHYs 청크를 넣어(또는 덮어써서) DPI를 기록한다 */
export async function pngWithDpi(blob, dpi) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const ppm = Math.round(dpi / 0.0254);

  const phys = new Uint8Array(21);
  const pv = new DataView(phys.buffer);
  pv.setUint32(0, 9);
  phys.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  pv.setUint32(8, ppm);
  pv.setUint32(12, ppm);
  phys[16] = 1; // 단위: 미터
  pv.setUint32(17, crc32(phys.subarray(4, 17)));

  // 기존 pHYs가 있으면 교체
  let pos = 8;
  while (pos < buf.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    if (type === 'pHYs') {
      return new Blob([buf.subarray(0, pos), phys, buf.subarray(pos + 12 + len)], { type: 'image/png' });
    }
    if (type === 'IDAT') break;
    pos += 12 + len;
  }
  const afterIHDR = 8 + 12 + dv.getUint32(8); // 시그니처 + IHDR 청크
  return new Blob([buf.subarray(0, afterIHDR), phys, buf.subarray(afterIHDR)], { type: 'image/png' });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`        → http://localhost (PC 테스트용, localhost는 보안 컨텍스트로 인정됨)
// `npm run dev:mobile` → https://<PC IP> (같은 와이파이의 휴대폰에서 카메라 테스트용)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'mobile' ? [basicSsl()] : [],
  server: mode === 'mobile' ? { host: true } : {},
  // onnxruntime-web의 wasm 로딩이 Vite 사전 번들링과 충돌하지 않도록 제외
  optimizeDeps: {
    exclude: ['@imgly/background-removal'],
  },
}));

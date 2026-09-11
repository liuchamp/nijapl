import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginTypeCheck } from '@rsbuild/plugin-type-check'

export default defineConfig({
  plugins: [
    pluginQRCode({
      schema(url) {
        // We use `?fullscreen=true` to open the page in LynxExplorer in full screen mode
        return `${url}?fullscreen=true`
      },
    }),
    pluginReactLynx(),
    pluginTypeCheck(),
  ],
  source: {
    // 构建期注入 TTS 服务 base URL（`src/constants/tts.ts` 读取 `__TTS_BASE_URL__`）。
    // 未设置 `TTS_BASE_URL` 时注入空串 → 运行期回落到本机调试默认值。
    // 生产：`TTS_BASE_URL=https://tts.<domain> npm run build`
    define: {
      __TTS_BASE_URL__: JSON.stringify(process.env.TTS_BASE_URL ?? ''),
    },
  },
  environments: {
    lynx: {},
  },
})

/**
 * TTS 端口类型入口（架构 §2.5 / §3.4）。
 *
 * 规范类型定义集中在 `src/types/ports.ts`（T01 冻结契约），本文件仅做**再导出**，
 * 避免同一契约出现两份定义（架构 §8.2）。
 */
export type {
  TtsCapability,
  TtsOptions,
  TtsPort,
  TtsResult,
  TtsVoice,
} from '../../types/ports.js'

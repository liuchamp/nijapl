import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMobileTts } from '../tts.mobile.js'

/**
 * 移动端原生 TTS 端口单测（`tts.mobile.ts`）。
 *
 * 真机 / 模拟器无法在本环境冒烟，故用 mock 覆盖：
 * - 桌面 `isMobile()===false` → 工厂返回 `null`（不构造）；
 * - 移动端 → `getCapability()==='supported'`；
 * - `speak()` 依赖的绑定 `Mobile.Speak` 为 **void（fire-and-forget）** →
 *   派发成功即乐观返回 `{ ok:true, engine:'native' }`；绑定异常才 `{ ok:false, reason:'error' }`；
 * - `stop()` / `getVoices()` 满足「端口永不 throw」契约。
 */
const h = vi.hoisted(() => ({
  mobile: true,
  speak: vi.fn<(text: string) => Promise<boolean>>(),
  stopSpeak: vi.fn<() => Promise<void>>(),
}))

vi.mock('../../platform/index.js', () => ({
  isMobile: () => h.mobile,
}))

vi.mock('../../../../bindings/nijapl/internal/services/index.js', () => ({
  Mobile: {
    Speak: (text: string) => h.speak(text),
    StopSpeak: () => h.stopSpeak(),
  },
}))

beforeEach(() => {
  h.mobile = true
  h.speak.mockReset()
  h.stopSpeak.mockReset()
  h.speak.mockResolvedValue(true)
  h.stopSpeak.mockResolvedValue(undefined)
})

describe('tts.mobile · 工厂与能力', () => {
  it('桌面（isMobile false）→ 返回 null，不构造端口', () => {
    h.mobile = false
    expect(createMobileTts()).toBeNull()
  })

  it('移动端 → 返回端口且能力为 supported', () => {
    const port = createMobileTts()
    expect(port).not.toBeNull()
    expect(port?.getCapability()).toBe('supported')
  })
})

describe('tts.mobile · speak（fire-and-forget 乐观返回）', () => {
  it('派发成功 → { ok: true, engine: native }，并把文本透传绑定', async () => {
    const port = createMobileTts()
    const result = await port?.speak('ねこ')
    expect(result).toEqual({ ok: true, engine: 'native' })
    expect(h.speak).toHaveBeenCalledWith('ねこ')
  })

  it('绑定调用异常 → { ok: false, reason: error }（端口永不 throw）', async () => {
    h.speak.mockRejectedValueOnce(new Error('host unreachable'))
    const port = createMobileTts()
    await expect(port?.speak('いぬ')).resolves.toEqual({
      ok: false,
      reason: 'error',
    })
  })
})

describe('tts.mobile · stop / getVoices（契约）', () => {
  it('stop() 调用绑定 StopSpeak 且不 throw', () => {
    const port = createMobileTts()
    expect(() => port?.stop()).not.toThrow()
    expect(h.stopSpeak).toHaveBeenCalledTimes(1)
  })

  it('stop() 绑定异常时仍不 throw', () => {
    h.stopSpeak.mockRejectedValueOnce(new Error('boom'))
    const port = createMobileTts()
    expect(() => port?.stop()).not.toThrow()
  })

  it('getVoices() 恒返回空列表', async () => {
    const port = createMobileTts()
    await expect(port?.getVoices()).resolves.toEqual([])
  })
})

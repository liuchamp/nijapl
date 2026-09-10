import { describe, expect, it } from 'vitest'

import { classifySwipe } from '../swipe.js'

describe('swipe · classifySwipe 方向判定', () => {
  it('横向向左超阈值 → left（跳过）', () => {
    expect(classifySwipe(-120, 4, 60)).toBe('left')
  })

  it('横向向右超阈值 → right（上一张）', () => {
    expect(classifySwipe(120, 4, 60)).toBe('right')
  })

  it('未达阈值 → none', () => {
    expect(classifySwipe(-30, 2, 60)).toBe('none')
    expect(classifySwipe(30, 2, 60)).toBe('none')
  })

  it('纵向位移更大 → none（避免误触滚动）', () => {
    expect(classifySwipe(-120, 200, 60)).toBe('none')
    expect(classifySwipe(120, -200, 60)).toBe('none')
  })

  it('零位移 → none', () => {
    expect(classifySwipe(0, 0, 60)).toBe('none')
  })

  it('非法数值 → none', () => {
    expect(classifySwipe(Number.NaN, 0, 60)).toBe('none')
    expect(classifySwipe(0, Number.POSITIVE_INFINITY, 60)).toBe('none')
  })
})

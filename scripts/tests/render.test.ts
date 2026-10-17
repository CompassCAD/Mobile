import { expect, test } from 'bun:test'
import { fillPolygon, strokePolyline, arcSegments, Sink } from '../../app/editor/render/tessellate'
import { BatchPath } from '../../app/editor/render/Context2DLike'
import { parseColor } from '../../app/editor/render/color'
import { DerakumaParser } from '../../app/editor/engine/fontobene/Derakuma'
import { readFileSync } from 'node:fs'

const collect = () => {
  let area = 0, tris = 0
  const s: Sink = { tri(ax, ay, bx, by, cx, cy) { area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2; tris++ } }
  return { s, get area() { return area }, get tris() { return tris } }
}

test('straight stroke area = length * width', () => {
  const c = collect()
  strokePolyline(c.s, [{ x: 0, y: 0 }, { x: 100, y: 0 }], false, 4, 'miter', 'butt')
  expect(c.area).toBeCloseTo(400, 3)
})
test('mitered right angle has no overlap (area = 2 segments minus nothing)', () => {
  const c = collect()
  strokePolyline(c.s, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], false, 10, 'miter', 'butt')
  expect(c.area).toBeCloseTo(100 * 10 + 100 * 10 - 0 + 0 - 0, 0) // 2000 (miter fills the corner exactly)
})
test('closed square stroke area', () => {
  const c = collect()
  strokePolyline(c.s, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true, 2, 'miter', 'butt')
  expect(c.area).toBeCloseTo(102 * 102 - 98 * 98, 1)
})
test('concave polygon fill area (L shape)', () => {
  const c = collect()
  fillPolygon(c.s, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }])
  expect(c.area).toBeCloseTo(300, 3)
})
test('non-finite and degenerate input never throws or emits', () => {
  const c = collect()
  strokePolyline(c.s, [{ x: NaN, y: 0 }, { x: Infinity, y: 1 }], false, 3, 'round', 'round')
  strokePolyline(c.s, [{ x: 1, y: 1 }, { x: 1, y: 1 }], false, 0, 'miter', 'butt')
  fillPolygon(c.s, [{ x: NaN, y: NaN }])
  expect(c.tris).toBe(0)
})
test('arc segments are clamped (no unbounded allocation at extreme zoom)', () => {
  expect(arcSegments(1e12, Math.PI * 2)).toBeLessThanOrEqual(256)
  expect(arcSegments(NaN, 1)).toBeGreaterThanOrEqual(4)
})
test('BatchPath replay roundtrip', () => {
  const p = new BatchPath(); p.moveTo(1, 2); p.lineTo(3, 4); p.arc(5, 6, 7, 0, 1)
  const log: string[] = []
  p.replay({ moveTo: (x, y) => log.push(`m${x},${y}`), lineTo: (x, y) => log.push(`l${x},${y}`), arc: (x, y, r) => log.push(`a${x},${y},${r}`) })
  expect(log).toEqual(['m1,2', 'l3,4', 'a5,6,7'])
})
test('colors', () => {
  expect(parseColor('#ff0000')).toBe(0xff0000ff)
  expect(parseColor('#fff')).toBe(0xffffffff)
  expect(parseColor('#00000000')).toBe(0)
})
test('Derakuma loads through a resolver (React Native path)', async () => {
  const text = readFileSync('app/editor/engine/fontobene/ansifont.bene', 'utf8')
  const fb = new DerakumaParser(async () => text)
  await fb.ready()
  const cmds = fb.getSentenceCommand('Hi')
  expect(cmds.length).toBeGreaterThan(0)
})

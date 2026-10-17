/**
 * CPU tessellation for the GLES backend. All functions append to a
 * `Sink` as triangles (x,y pairs). Everything is bounds-guarded: non-finite
 * input is dropped and arc/segment counts are clamped, so a bad frame can
 * never allocate unbounded memory (the RangeError class of bugs).
 */
export interface Sink {
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void
}
export type Pt = { x: number; y: number }

const MAX_ARC_SEGMENTS = 256
const MIN_ARC_SEGMENTS = 4
const MITER_LIMIT = 4

export function arcSegments(radiusPx: number, sweep: number): number {
  const r = Math.abs(radiusPx)
  if (!isFinite(r) || !isFinite(sweep) || r < 1e-6) return MIN_ARC_SEGMENTS
  const step = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - 0.25 / Math.max(r, 0.3))))
  const n = Math.ceil(Math.abs(sweep) / Math.max(step, 1e-3))
  return Math.max(MIN_ARC_SEGMENTS, Math.min(MAX_ARC_SEGMENTS, n))
}

function fan(s: Sink, cx: number, cy: number, r: number, a0: number, a1: number) {
  const n = arcSegments(r, a1 - a0)
  let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
    s.tri(cx, cy, px, py, x, y)
    px = x; py = y
  }
}

export type JoinKind = 'miter' | 'round' | 'bevel'
export type CapKind = 'butt' | 'round' | 'square'

/** Strokes one polyline into non-overlapping quads (miter/bevel/round joins). */
export function strokePolyline(
  s: Sink, input: Pt[], closed: boolean, width: number, join: JoinKind, cap: CapKind
): void {
  const h = width / 2
  if (!(h > 0) || !isFinite(h)) return
  const pts: Pt[] = []
  for (const p of input) {
    if (!isFinite(p.x) || !isFinite(p.y)) continue
    const l = pts[pts.length - 1]
    if (!l || Math.abs(l.x - p.x) > 1e-6 || Math.abs(l.y - p.y) > 1e-6) pts.push(p)
  }
  if (closed && pts.length > 2) {
    const f = pts[0], l = pts[pts.length - 1]
    if (Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) pts.pop()
  }
  const n = pts.length
  if (n === 1) { // dot
    if (cap === 'round') fan(s, pts[0].x, pts[0].y, h, 0, Math.PI * 2)
    else if (cap === 'square') {
      const { x, y } = pts[0]
      s.tri(x - h, y - h, x + h, y - h, x + h, y + h); s.tri(x - h, y - h, x + h, y + h, x - h, y + h)
    }
    return
  }
  if (n < 2) return
  const segCount = closed ? n : n - 1
  const dx: number[] = [], dy: number[] = [], len: number[] = []
  for (let i = 0; i < segCount; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    const l = Math.hypot(b.x - a.x, b.y - a.y)
    len.push(l); dx.push((b.x - a.x) / l); dy.push((b.y - a.y) / l)
  }
  // edge points per segment: [startL, startR, endL, endR] as x,y
  const E: number[][] = []
  for (let i = 0; i < segCount; i++) {
    const nx = -dy[i] * h, ny = dx[i] * h
    const a = pts[i], b = pts[(i + 1) % n]
    E.push([a.x + nx, a.y + ny, a.x - nx, a.y - ny, b.x + nx, b.y + ny, b.x - nx, b.y - ny])
  }
  const joint = (i: number, j: number, vi: number) => {
    const v = pts[vi]
    const cross = dx[i] * dy[j] - dy[i] * dx[j]
    const dot = dx[i] * dx[j] + dy[i] * dy[j]
    if (Math.abs(cross) < 1e-6 && dot > 0) return
    const nax = -dy[i], nay = dx[i], nbx = -dy[j], nby = dx[j]
    const mx = nax + nbx, my = nay + nby
    const l2 = mx * mx + my * my
    if (l2 < 1e-9) return // 180° reversal: leave butt ends
    const k = (2 / l2) * h
    const ox = mx * k, oy = my * k
    const ratio = Math.hypot(ox, oy) / h
    const e1 = E[i], e2 = E[j]
    if (join === 'miter' && ratio <= MITER_LIMIT) {
      e1[4] = v.x + ox; e1[5] = v.y + oy; e1[6] = v.x - ox; e1[7] = v.y - oy
      e2[0] = v.x + ox; e2[1] = v.y + oy; e2[2] = v.x - ox; e2[3] = v.y - oy
      return
    }
    const inner = Math.hypot(ox, oy)
    if (inner > Math.min(len[i], len[j])) return // inner point would overshoot: tolerate overlap
    if (cross > 0) { // turns toward left normal: left is inner
      e1[4] = v.x + ox; e1[5] = v.y + oy; e2[0] = v.x + ox; e2[1] = v.y + oy
      wedge(s, v, v.x - nax * h, v.y - nay * h, v.x - nbx * h, v.y - nby * h, join, h)
    } else {
      e1[6] = v.x - ox; e1[7] = v.y - oy; e2[2] = v.x - ox; e2[3] = v.y - oy
      wedge(s, v, v.x + nax * h, v.y + nay * h, v.x + nbx * h, v.y + nby * h, join, h)
    }
  }
  for (let i = 0; i < segCount - 1; i++) joint(i, i + 1, i + 1)
  if (closed) joint(segCount - 1, 0, 0)
  for (let i = 0; i < segCount; i++) {
    const e = E[i]
    s.tri(e[0], e[1], e[2], e[3], e[6], e[7])
    s.tri(e[0], e[1], e[6], e[7], e[4], e[5])
  }
  if (!closed) {
    const a = pts[0], b = pts[n - 1]
    if (cap === 'round') {
      const a0 = Math.atan2(dy[0], dx[0]), a1 = Math.atan2(dy[segCount - 1], dx[segCount - 1])
      fan(s, a.x, a.y, h, a0 + Math.PI / 2, a0 + (Math.PI * 3) / 2)
      fan(s, b.x, b.y, h, a1 - Math.PI / 2, a1 + Math.PI / 2)
    } else if (cap === 'square') {
      const e = E[0], f = E[segCount - 1]
      const sx = -dx[0] * h, sy = -dy[0] * h, tx = dx[segCount - 1] * h, ty = dy[segCount - 1] * h
      s.tri(e[0], e[1], e[2], e[3], e[2] + sx, e[3] + sy); s.tri(e[0], e[1], e[2] + sx, e[3] + sy, e[0] + sx, e[1] + sy)
      s.tri(f[4], f[5], f[6], f[7], f[6] + tx, f[7] + ty); s.tri(f[4], f[5], f[6] + tx, f[7] + ty, f[4] + tx, f[5] + ty)
    }
  }
}

function wedge(s: Sink, v: Pt, ax: number, ay: number, bx: number, by: number, join: JoinKind, h: number) {
  if (join === 'round') {
    let a0 = Math.atan2(ay - v.y, ax - v.x), a1 = Math.atan2(by - v.y, bx - v.x)
    let d = a1 - a0
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    fan(s, v.x, v.y, h, a0, a0 + d)
  } else s.tri(v.x, v.y, ax, ay, bx, by)
}

function area(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y }
  return a / 2
}

/** Fills a simple polygon: fan if convex, ear clipping otherwise (n<=2048). */
export function fillPolygon(s: Sink, poly: Pt[]): void {
  const p = poly.filter((q) => isFinite(q.x) && isFinite(q.y))
  if (p.length > 1) {
    const f = p[0], l = p[p.length - 1]
    if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) p.pop()
  }
  const n = p.length
  if (n < 3) return
  const ccw = area(p) > 0
  const cr = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
  let convex = true
  for (let i = 0; i < n && convex; i++) {
    const c = cr(p[i], p[(i + 1) % n], p[(i + 2) % n])
    if (ccw ? c < -1e-9 : c > 1e-9) convex = false
  }
  if (convex || n > 2048) {
    for (let i = 1; i < n - 1; i++) s.tri(p[0].x, p[0].y, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y)
    return
  }
  const idx = p.map((_, i) => i)
  let guard = n * n
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const a = p[idx[(k + idx.length - 1) % idx.length]], b = p[idx[k]], c = p[idx[(k + 1) % idx.length]]
      const turn = cr(a, b, c)
      if (ccw ? turn <= 0 : turn >= 0) continue
      let inside = false
      for (const j of idx) {
        const q = p[j]
        if (q === a || q === b || q === c) continue
        const d1 = cr(a, b, q), d2 = cr(b, c, q), d3 = cr(c, a, q)
        if (ccw ? d1 >= 0 && d2 >= 0 && d3 >= 0 : d1 <= 0 && d2 <= 0 && d3 <= 0) { inside = true; break }
      }
      if (inside) continue
      s.tri(a.x, a.y, b.x, b.y, c.x, c.y)
      idx.splice(k, 1); clipped = true; break
    }
    if (!clipped) break
  }
  if (idx.length === 3) s.tri(p[idx[0]].x, p[idx[0]].y, p[idx[1]].x, p[idx[1]].y, p[idx[2]].x, p[idx[2]].y)
}

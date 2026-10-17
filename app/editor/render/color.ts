const cache = new Map<string, number>()
const NAMED: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', cyan: '#00ffff', magenta: '#ff00ff', gray: '#808080', grey: '#808080',
  orange: '#ffa500', transparent: '#00000000'
}
/** Parses a CSS color into packed ABGR (little-endian RGBA bytes). Cached. */
export function parseColor(input: string): number {
  let v = cache.get(input)
  if (v !== undefined) return v
  let s = (NAMED[input.toLowerCase()] ?? input).trim()
  let r = 255, g = 0, b = 255, a = 255
  if (s[0] === '#') {
    s = s.slice(1)
    if (s.length === 3 || s.length === 4) s = s.split('').map((c) => c + c).join('')
    if (s.length === 6 || s.length === 8) {
      r = parseInt(s.slice(0, 2), 16); g = parseInt(s.slice(2, 4), 16); b = parseInt(s.slice(4, 6), 16)
      a = s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255
    }
  } else {
    const m = /rgba?\(([^)]+)\)/i.exec(s)
    if (m) {
      const p = m[1].split(',').map((x) => parseFloat(x))
      r = p[0]; g = p[1]; b = p[2]; a = p.length > 3 ? Math.round(p[3] * 255) : 255
    }
  }
  const c = (r & 255) | ((g & 255) << 8) | ((b & 255) << 16) | ((a & 255) << 24)
  v = c >>> 0
  if (cache.size > 2048) cache.clear()
  cache.set(input, v)
  return v
}
export function withAlpha(packed: number, alpha: number): number {
  const a = Math.max(0, Math.min(255, Math.round(((packed >>> 24) & 255) * alpha)))
  return (((packed & 0x00ffffff) | (a << 24)) >>> 0)
}

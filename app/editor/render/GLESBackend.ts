import { Asset } from 'expo-asset'
import * as FileSystem from 'expo-file-system/legacy'
import type { ExpoWebGLRenderingContext } from 'expo-gl'
import { parseColor, withAlpha } from './color'
import { BackendImage, BatchPath, Context2DLike, RenderBackend } from './Context2DLike'
import { arcSegments, CapKind, fillPolygon, JoinKind, Pt, Sink, strokePolyline } from './tessellate'

const VS = `attribute vec2 a_pos; attribute vec4 a_col; attribute vec2 a_uv;
uniform vec2 u_res; varying vec4 v_col; varying vec2 v_uv;
void main(){ vec2 c=(a_pos/u_res)*2.0-1.0; gl_Position=vec4(c.x,-c.y,0.0,1.0); v_col=a_col; v_uv=a_uv; }`
const FS_COLOR = `precision mediump float; varying vec4 v_col; void main(){ gl_FragColor=v_col; }`
const FS_TEX = `precision mediump float; varying vec4 v_col; varying vec2 v_uv; uniform sampler2D u_tex;
void main(){ vec4 t=texture2D(u_tex,v_uv); gl_FragColor=vec4(t.rgb*t.a,t.a)*v_col.a; }`

const STRIDE = 20 // x,y,u,v (4 floats) + packed color (1 uint32)
const MAX_VERTS = 1 << 20

interface State {
  strokeStyle: string; fillStyle: string; lineWidth: number
  lineJoin: JoinKind; lineCap: CapKind; globalAlpha: number
  m: number[]
}
interface GLImage extends BackendImage { handle: WebGLTexture }

export class GLESBackend implements RenderBackend, Context2DLike, Sink {
  readonly kind = 'gles' as const
  readonly ctx: Context2DLike = this

  strokeStyle = '#000'; fillStyle = '#000'; lineWidth = 1
  lineJoin: JoinKind = 'miter'; lineCap: CapKind = 'butt'; globalAlpha = 1
  font = '10px sans-serif'; textAlign = 'left'; textBaseline = 'alphabetic'

  private m = [1, 0, 0, 1, 0, 0] // a b c d e f
  private stack: State[] = []
  private subpaths: { pts: Pt[]; closed: boolean }[] = []
  private cur: Pt[] | null = null

  private f32 = new Float32Array((1 << 14) * 5)
  private u32 = new Uint32Array(this.f32.buffer)
  private count = 0
  private color = 0

  private gl: ExpoWebGLRenderingContext
  private progColor!: WebGLProgram
  private progTex!: WebGLProgram
  private buf!: WebGLBuffer
  private w: number; private h: number; private dpr: number

  constructor(gl: ExpoWebGLRenderingContext, width: number, height: number, dpr: number) {
    console.log('[editor] GLESBackend init', width, height, dpr)
    this.gl = gl; this.w = width; this.h = height; this.dpr = dpr
    this.progColor = this.program(VS, FS_COLOR)
    this.progTex = this.program(VS, FS_TEX)
    this.buf = gl.createBuffer()!
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // premultiplied in shader (see flush)
    console.log('[editor] GLESBackend ready')
  }

  private program(vs: string, fs: string): WebGLProgram {
    console.log('[editor] GLESBackend compiling shader')
    const gl = this.gl
    const mk = (t: number, src: string) => {
      const s = gl.createShader(t)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('GLSL: ' + gl.getShaderInfoLog(s))
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('GL link: ' + gl.getProgramInfoLog(p))
    return p
  }

  // ---- RenderBackend ----
  resize(width: number, height: number, pixelRatio: number): void {
    this.w = width; this.h = height; this.dpr = pixelRatio
  }
  beginFrame(): void {
    console.log('[editor] GLESBackend beginFrame', this.w, this.h, this.dpr)
    const gl = this.gl
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    this.m = [1, 0, 0, 1, 0, 0]; this.stack.length = 0
    this.count = 0
  }
  endFrame(): void {
    console.log('[editor] GLESBackend endFrame', this.count)
    this.flush()
    ;(this.gl as ExpoWebGLRenderingContext).endFrameEXP()
  }
  dispose(): void {
    console.log('[editor] GLESBackend dispose frame')
    this.gl.deleteBuffer(this.buf)
    this.gl.deleteProgram(this.progColor); this.gl.deleteProgram(this.progTex)
  }
  async loadImage(url: string): Promise<BackendImage> {
    let uri = url
    if (url.startsWith('data:')) {
      const ext = /^data:image\/(\w+)/.exec(url)?.[1] ?? 'png'
      uri = `${FileSystem.cacheDirectory}pic_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`
      await FileSystem.writeAsStringAsync(uri, url.slice(url.indexOf(',') + 1), { encoding: FileSystem.EncodingType.Base64 })
    }
    const asset = await Asset.fromURI(uri).downloadAsync()
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset as any)
    const img: GLImage = { naturalWidth: asset.width ?? 100, naturalHeight: asset.height ?? 100, handle: tex }
    return img
  }

  // ---- batching ----
  private ensure(extra: number) {
    console.log('[editor] GLESBackend ensure', this.count, extra)
    const need = this.count + extra
    if (need > MAX_VERTS) { this.flush(); return }
    if (need * 5 > this.f32.length) {
      let cap = this.f32.length
      while (cap < need * 5) cap *= 2
      const nf = new Float32Array(cap)
      nf.set(this.f32.subarray(0, this.count * 5))
      this.f32 = nf; this.u32 = new Uint32Array(nf.buffer)
    }
  }
  private v(x: number, y: number) {
    const m = this.m, i = this.count * 5
    this.f32[i] = m[0] * x + m[2] * y + m[4]
    this.f32[i + 1] = m[1] * x + m[3] * y + m[5]
    this.f32[i + 2] = 0; this.f32[i + 3] = 0
    this.u32[i + 4] = this.color
    this.count++
  }
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
    this.ensure(3)
    this.v(ax, ay); this.v(bx, by); this.v(cx, cy)
  }
  private flush(prog = this.progColor, tex: WebGLTexture | null = null) {
    if (this.count === 0) return
    const gl = this.gl
    gl.useProgram(prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, this.f32.subarray(0, this.count * 5), gl.STREAM_DRAW)
    const loc = (n: string) => gl.getAttribLocation(prog, n)
    const pos = loc('a_pos'), uv = loc('a_uv'), col = loc('a_col')
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, STRIDE, 0)
    gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, STRIDE, 8)
    gl.enableVertexAttribArray(col); gl.vertexAttribPointer(col, 4, gl.UNSIGNED_BYTE, true, STRIDE, 16)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_res'), gl.drawingBufferWidth / this.dpr, gl.drawingBufferHeight / this.dpr)
    if (tex) { gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0) }
    gl.drawArrays(gl.TRIANGLES, 0, this.count)
    this.count = 0
  }
  /** premultiplied packed color for current alpha */
  private pm(style: string): number {
    const c = withAlpha(parseColor(style), this.globalAlpha)
    const a = (c >>> 24) / 255
    const r = Math.round((c & 255) * a), g = Math.round(((c >>> 8) & 255) * a), b = Math.round(((c >>> 16) & 255) * a)
    return ((r | (g << 8) | (b << 16) | ((c >>> 24) << 24)) >>> 0)
  }

  // ---- state ----
  save(): void {
    this.stack.push({
      strokeStyle: this.strokeStyle, fillStyle: this.fillStyle, lineWidth: this.lineWidth,
      lineJoin: this.lineJoin, lineCap: this.lineCap, globalAlpha: this.globalAlpha, m: this.m.slice()
    })
  }
  restore(): void {
    const s = this.stack.pop() // unbalanced restore is a no-op, like browsers
    if (!s) return
    Object.assign(this, { strokeStyle: s.strokeStyle, fillStyle: s.fillStyle, lineWidth: s.lineWidth,
      lineJoin: s.lineJoin, lineCap: s.lineCap, globalAlpha: s.globalAlpha })
    this.m = s.m
  }
  private mul(a: number, b: number, c: number, d: number, e: number, f: number) {
    const m = this.m
    this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d,
      m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]
  }
  translate(x: number, y: number): void { if (isFinite(x) && isFinite(y)) this.mul(1, 0, 0, 1, x, y) }
  rotate(r: number): void { if (isFinite(r)) { const c = Math.cos(r), s = Math.sin(r); this.mul(c, s, -s, c, 0, 0) } }
  scale(x: number, y: number): void { if (isFinite(x) && isFinite(y)) this.mul(x, 0, 0, y, 0, 0) }

  // ---- path ----
  beginPath(): void { this.subpaths = []; this.cur = null }
  private start(x: number, y: number) { this.cur = [{ x, y }]; this.subpaths.push({ pts: this.cur, closed: false }) }
  moveTo(x: number, y: number): void { if (isFinite(x) && isFinite(y)) this.start(x, y) }
  lineTo(x: number, y: number): void {
    if (!isFinite(x) || !isFinite(y)) return
    if (!this.cur) this.start(x, y); else this.cur.push({ x, y })
  }
  closePath(): void { const s = this.subpaths[this.subpaths.length - 1]; if (s) s.closed = true; this.cur = null }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    if (![x, y, r, a0, a1].every(isFinite) || r <= 0) return
    let sweep = a1 - a0
    if (!ccw && sweep > Math.PI * 2) sweep = Math.PI * 2
    if (ccw && sweep < -Math.PI * 2) sweep = -Math.PI * 2
    if (!ccw && sweep < 0) sweep = ((sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    if (ccw && sweep > 0) sweep = -(((-sweep % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
    const scale = Math.hypot(this.m[0], this.m[1]) || 1
    const n = arcSegments(r * scale, sweep)
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      if (i === 0) { if (!this.cur) this.start(px, py); else this.cur.push({ x: px, y: py }) }
      else this.cur!.push({ x: px, y: py })
    }
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.start(x, y); this.cur!.push({ x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }); this.closePath()
  }
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
    this.moveTo(x + rr, y)
    this.lineTo(x + w - rr, y); this.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0)
    this.lineTo(x + w, y + h - rr); this.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2)
    this.lineTo(x + rr, y + h); this.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI)
    this.lineTo(x, y + rr); this.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5)
    this.closePath()
  }

  // ---- paint ----
  fill(): void {
    this.color = this.pm(this.fillStyle)
    for (const sp of this.subpaths) fillPolygon(this, sp.pts)
  }
  /** Transform is applied to vertices; stroke widths are in local units, as in Canvas2D. */
  stroke(path?: BatchPath): void {
    this.color = this.pm(this.strokeStyle)
    let subs = this.subpaths
    if (path) {
      const saved = this.subpaths, savedCur = this.cur
      this.subpaths = []; this.cur = null
      path.replay(this)
      subs = this.subpaths; this.subpaths = saved; this.cur = savedCur
    }
    for (const sp of subs) strokePolyline(this, sp.pts, sp.closed, this.lineWidth, this.lineJoin, this.lineCap)
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.color = this.pm(this.fillStyle)
    this.tri(x, y, x + w, y, x + w, y + h); this.tri(x, y, x + w, y + h, x, y + h)
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    const keep = this.subpaths
    this.subpaths = []; this.rect(x, y, w, h); this.stroke(); this.subpaths = keep
  }
  fillText(): void { /* text is rendered as FontoBene vector strokes by the engine */ }
  measureText(text: string): { width: number } {
    const px = parseFloat(this.font) || 10
    return { width: text.length * px * 0.55 }
  }
  drawImage(img: BackendImage, x: number, y: number, w: number, h: number): void {
    this.flush()
    this.color = this.pm('#ffffff')
    const p = [[x, y, 0, 0], [x + w, y, 1, 0], [x + w, y + h, 1, 1], [x, y, 0, 0], [x + w, y + h, 1, 1], [x, y + h, 0, 1]]
    this.ensure(6)
    for (const q of p) {
      this.v(q[0], q[1])
      const i = (this.count - 1) * 5
      this.f32[i + 2] = q[2]; this.f32[i + 3] = q[3]
    }
    this.flush(this.progTex, img.handle as WebGLTexture)
  }
}

import { Image } from 'react-native'
import type Canvas from 'react-native-canvas'
import { Image as CanvasImage } from 'react-native-canvas'
import { BackendImage, BatchPath, Context2DLike, RenderBackend } from './Context2DLike'

/**
 * react-native-canvas runs a real <canvas> in a WebView; every call is a
 * message over the bridge. This wrapper keeps the call count low:
 *  - consecutive fillRect()s of one style (the grid dots) become one path fill
 *  - BatchPath replays into a single stroke
 *  - restore() with an empty stack is ignored (a stray restore desyncs the bridge)
 *  - measureText is synchronous (the native one is async) and approximate
 */
export class Canvas2DBackend implements RenderBackend, Context2DLike {
  readonly kind = 'canvas2d' as const
  readonly ctx: Context2DLike = this
  private raw: any
  private depth = 0
  private pendingRects: number[] = []
  private pendingStyle = ''
  strokeStyle = '#000'; fillStyle = '#000'; lineWidth = 1
  lineJoin: 'miter' | 'round' | 'bevel' = 'miter'; lineCap: 'butt' | 'round' | 'square' = 'butt'
  globalAlpha = 1; font = '10px sans-serif'; textAlign = 'left'; textBaseline = 'alphabetic'

  constructor(private canvas: Canvas, private w: number, private h: number) {
    this.raw = canvas.getContext('2d')
  }
  resize(w: number, h: number): void { this.w = w; this.h = h }
  beginFrame(): void { this.depth = 0 }
  endFrame(): void { this.flushRects() }
  dispose(): void { this.pendingRects = [] }
  loadImage(url: string): Promise<BackendImage> {
    return new Promise((resolve, reject) => {
      const img = new CanvasImage(this.canvas)
      img.addEventListener('load', () => {
        if (img.width > 0 && img.height > 0) {
          resolve({ naturalWidth: img.width, naturalHeight: img.height, handle: img })
          return
        }
        Image.getSize(url).then(({ width, height }) => {
          resolve({ naturalWidth: width, naturalHeight: height, handle: img })
        }, reject)
      })
      img.addEventListener('error', () => reject(new Error('image load failed')))
      img.src = url
    })
  }
  private sync() {
    const r = this.raw
    r.strokeStyle = this.strokeStyle; r.fillStyle = this.fillStyle; r.lineWidth = this.lineWidth
    r.lineJoin = this.lineJoin; r.lineCap = this.lineCap; r.globalAlpha = this.globalAlpha
  }
  private flushRects() {
    if (!this.pendingRects.length) return
    const r = this.raw, p = this.pendingRects
    r.fillStyle = this.pendingStyle
    r.beginPath()
    for (let i = 0; i < p.length; i += 4) r.rect(p[i], p[i + 1], p[i + 2], p[i + 3])
    r.fill()
    this.pendingRects = []
  }
  save(): void { this.flushRects(); this.depth++; this.raw.save() }
  restore(): void { this.flushRects(); if (this.depth > 0) { this.depth--; this.raw.restore() } }
  translate(x: number, y: number): void { this.flushRects(); this.raw.translate(x, y) }
  rotate(a: number): void { this.flushRects(); this.raw.rotate(a) }
  scale(x: number, y: number): void { this.flushRects(); this.raw.scale(x, y) }
  beginPath(): void { this.flushRects(); this.raw.beginPath() }
  closePath(): void { this.raw.closePath() }
  moveTo(x: number, y: number): void { this.raw.moveTo(x, y) }
  lineTo(x: number, y: number): void { this.raw.lineTo(x, y) }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    if ([x, y, r, a0, a1].every(isFinite) && r >= 0) this.raw.arc(x, y, r, a0, a1, ccw)
  }
  rect(x: number, y: number, w: number, h: number): void { this.raw.rect(x, y, w, h) }
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
    this.raw.moveTo(x + rr, y); this.raw.arcTo(x + w, y, x + w, y + h, rr); this.raw.arcTo(x + w, y + h, x, y + h, rr)
    this.raw.arcTo(x, y + h, x, y, rr); this.raw.arcTo(x, y, x + w, y, rr); this.raw.closePath()
  }
  fill(): void { this.flushRects(); this.sync(); this.raw.fill() }
  stroke(path?: BatchPath): void {
    this.flushRects(); this.sync()
    if (path) { this.raw.beginPath(); path.replay(this) }
    this.raw.stroke()
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    if (this.pendingRects.length && this.pendingStyle !== this.fillStyle) this.flushRects()
    if (this.globalAlpha !== 1) { this.flushRects(); this.sync(); this.raw.fillRect(x, y, w, h); return }
    this.pendingStyle = this.fillStyle
    this.pendingRects.push(x, y, w, h)
    if (this.pendingRects.length > 4000) this.flushRects() // bound the batch size
  }
  strokeRect(x: number, y: number, w: number, h: number): void { this.flushRects(); this.sync(); this.raw.strokeRect(x, y, w, h) }
  fillText(text: string, x: number, y: number): void {
    this.flushRects(); this.sync()
    this.raw.font = this.font; this.raw.textAlign = this.textAlign; this.raw.textBaseline = this.textBaseline
    this.raw.fillText(text, x, y)
  }
  measureText(text: string): { width: number } { return { width: text.length * (parseFloat(this.font) || 10) * 0.55 } }
  drawImage(img: BackendImage, x: number, y: number, w: number, h: number): void {
    this.flushRects(); this.sync(); this.raw.drawImage(img.handle, x, y, w, h)
  }
}

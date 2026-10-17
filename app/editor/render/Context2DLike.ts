/**
 * The subset of CanvasRenderingContext2D that the CompassCAD engine uses.
 * Both render backends (Canvas2D bridge, GLES) implement exactly this, so the
 * engine never talks to a concrete graphics API.
 */
export interface BackendImage {
  naturalWidth: number
  naturalHeight: number
  /** opaque backend handle (texture / canvas image) */
  handle: unknown
}

export interface Context2DLike {
  strokeStyle: string
  fillStyle: string
  lineWidth: number
  lineJoin: 'miter' | 'round' | 'bevel'
  lineCap: 'butt' | 'round' | 'square'
  globalAlpha: number
  font: string
  textAlign: string
  textBaseline: string

  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(rad: number): void
  scale(x: number, y: number): void

  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void
  rect(x: number, y: number, w: number, h: number): void
  roundRect(x: number, y: number, w: number, h: number, r: number): void
  fill(): void
  stroke(path?: BatchPath): void
  fillRect(x: number, y: number, w: number, h: number): void
  strokeRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { width: number }
  drawImage(img: BackendImage, x: number, y: number, w: number, h: number): void
}

/** Path2D replacement: a flat, allocation-light command stream. */
export class BatchPath {
  static readonly MOVE = 0
  static readonly LINE = 1
  static readonly ARC = 2
  /** [op, ...args] packed into one array */
  readonly ops: number[] = []
  moveTo(x: number, y: number): void {
    this.ops.push(BatchPath.MOVE, x, y)
  }
  lineTo(x: number, y: number): void {
    this.ops.push(BatchPath.LINE, x, y)
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ops.push(BatchPath.ARC, x, y, r, a0, a1, ccw ? 1 : 0)
  }
  /** Replays onto any context-like path builder. */
  replay(t: Pick<Context2DLike, 'moveTo' | 'lineTo' | 'arc'>): void {
    const o = this.ops
    for (let i = 0; i < o.length; ) {
      const op = o[i]
      if (op === BatchPath.MOVE) { t.moveTo(o[i + 1], o[i + 2]); i += 3 }
      else if (op === BatchPath.LINE) { t.lineTo(o[i + 1], o[i + 2]); i += 3 }
      else { t.arc(o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5], o[i + 6] === 1); i += 7 }
    }
  }
}

export interface RenderBackend {
  readonly kind: 'canvas2d' | 'gles'
  readonly ctx: Context2DLike
  resize(width: number, height: number, pixelRatio: number): void
  beginFrame(): void
  endFrame(): void
  loadImage(url: string): Promise<BackendImage>
  dispose(): void
}

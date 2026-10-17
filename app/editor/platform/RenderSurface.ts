import type { Context2DLike, RenderBackend, BackendImage } from '../render/Context2DLike'

/**
 * Stand-in for HTMLCanvasElement. The upstream engine only touches this tiny
 * surface (offsets, bounding rect, style.cursor, getContext, toBlob, focus),
 * which keeps Engine.ts nearly identical to NextDesktop.
 */
export class RenderSurface {
  offsetLeft = 0
  offsetTop = 0
  style: { cursor: string } = { cursor: '' }
  constructor(
    public backend: RenderBackend,
    public width: number,
    public height: number
  ) {}
  getContext(_kind: '2d'): Context2DLike {
    return this.backend.ctx
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: this.width, bottom: this.height, width: this.width, height: this.height }
  }
  focus(): void {}
  toBlob(cb: (b: Blob | null) => void, _type?: string): void {
    cb(null) // snapshots: not supported on mobile yet
  }
  loadImage(url: string): Promise<BackendImage> {
    return this.backend.loadImage(url)
  }
}

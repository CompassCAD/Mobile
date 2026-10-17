import type { GraphicsRenderer } from '../engine/Engine'
import { __setFps } from '../engine/Engine'
import * as Types from '../engine/Types'

/** Synthetic DOM-like event so the engine's performAction() works unchanged. */
const evt = (x: number, y: number) =>
  ({ clientX: x, clientY: y, pageX: x, pageY: y, which: 1, preventDefault() {} }) as any

export interface TouchPoint { x: number; y: number }

/**
 * Gesture adapter. The view feeds raw touches in (see EditorView); this maps
 * them to the same mouse/zoom actions the desktop DOM listeners produce.
 * Rules mirror NextDesktop's touch handlers: Navigate pans on drag, tools fire
 * on tap-release, two fingers pinch-zoom in every mode.
 */
export class TouchInput {
  private pinchDist = 0
  private pinching = false
  private pendingZoom: number | null = null
  private zoomRAF: number | null = null
  constructor(private r: GraphicsRenderer) {}

  private queueZoom(factor: number) {
    this.pendingZoom = this.pendingZoom === null ? factor : this.pendingZoom * factor
    if (this.zoomRAF === null) {
      this.zoomRAF = requestAnimationFrame(() => {
        if (this.pendingZoom !== null && isFinite(this.pendingZoom) && this.pendingZoom > 0) this.r.setZoom(this.pendingZoom)
        this.pendingZoom = null
        this.zoomRAF = null
      })
    }
  }
  private setCursor(p: TouchPoint) {
    this.r.mouse!.cursorXGlobal = p.x
    this.r.mouse!.cursorYGlobal = p.y
  }

  start(touches: TouchPoint[]) {
    const r = this.r
    if (!r.mouse) return
    if (touches.length >= 2) {
      this.pinching = true
      this.pinchDist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y)
      // cancel a pan that the first finger started
      if (r.camMoving) { r.camMoving = false; r.markDirty('pinch cancelled pan') }
      return
    }
    this.setCursor(touches[0])
    // hover-style update first so Select/Delete/Move see the node under the finger
    r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Move)
    if (r.mode === r.modes.Navigate) r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Down)
    else if (r.mode === r.modes.Select) r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Down)
  }

  move(touches: TouchPoint[]) {
    const r = this.r
    if (!r.mouse) return
    if (touches.length >= 2 && this.pinching) {
      const d = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y)
      if (this.pinchDist > 0 && d > 0) this.queueZoom(d / this.pinchDist)
      this.pinchDist = d
      return
    }
    if (this.pinching) return // one finger lifted mid-pinch: ignore until all up
    this.setCursor(touches[0])
    if (!r.didCursorActuallyMove(evt(touches[0].x, touches[0].y))) return
    r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Move)
  }

  end(point: TouchPoint | null, remaining: number) {
    const r = this.r
    if (!r.mouse) return
    if (this.pinching) { if (remaining === 0) this.pinching = false; return }
    if (!point) return
    this.setCursor(point)
    const e = evt(point.x, point.y)
    if (r.mode === r.modes.Navigate || r.mode === r.modes.Select) {
      r.performAction(e, r.mouseAction.Up)
      return
    }
    // draw / move / delete tools commit on tap release
    r.performAction(e, r.mouseAction.Move)
    r.performAction(e, r.mouseAction.Down)
    r.performAction(e, r.mouseAction.Up)
  }

  dispose() {
    if (this.zoomRAF !== null) cancelAnimationFrame(this.zoomRAF)
    this.zoomRAF = null
  }
}

/**
 * Starts the engine and its render loop. Returns a disposer.
 * Frame pacing: the engine only repaints when dirty (its own _dirty flag); the
 * loop itself idles at a low rate and is paused when the app is backgrounded.
 */
export const InitializeInstance = (renderer: GraphicsRenderer, onFps?: (fps: number) => void): (() => void) => {
  let raf: number | null = null
  let stopped = false
  let frames = 0
  let lastFps = performance.now()

  renderer.start().then(() => {
    if (stopped) return
    renderer.keyboard?.addKeyEvent(true, Types.default.KeyCodes.DEL, () => renderer.forcefullyRemoveSelectedComponentOnActiveIndex(), { ctrl: false })
    renderer.keyboard?.addKeyEvent(true, Types.default.KeyCodes.R, () => renderer.rotateSelected(), { ctrl: false })
    const loop = (t: number) => {
      if (stopped) return
      try {
        renderer.update()
        frames++
      } catch (error) {
        // never let one bad frame kill the loop (and never log the entire scene)
        console.error('[render] frame failed:', (error as Error)?.name, (error as Error)?.message)
      }
      if (t - lastFps >= 500) {
        const fps = Math.round((frames * 1000) / (t - lastFps))
        __setFps(fps)
        onFps?.(fps)
        frames = 0
        lastFps = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  })

  return () => {
    stopped = true
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
  }
}

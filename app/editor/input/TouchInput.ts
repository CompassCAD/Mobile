import type { GraphicsRenderer } from '../engine/Engine'
import { __setFps } from '../engine/Engine'
import * as Types from '../engine/Types'

/** Synthetic DOM-like event so the engine's performAction() works unchanged. */
const evt = (x: number, y: number) =>
  ({ clientX: x, clientY: y, pageX: x, pageY: y, which: 1, preventDefault() { } }) as any

export interface TouchPoint { x: number; y: number }

/**
 * Gesture adapter. The view feeds raw touches in (see EditorView); this maps
 * them to the same mouse/zoom actions the desktop DOM listeners produce.
 * Rules mirror NextDesktop's touch handlers: Navigate pans on drag, tools fire
 * on tap-release, two fingers pinch-zoom in every mode.
 */
export class TouchInput {
  private pinching = false
  private pinchDist = 0
  private mid: TouchPoint = { x: 0, y: 0 }
  // gesture deltas are coalesced and applied once per frame
  private pendingZoom = 1
  private pendingPan = { x: 0, y: 0 }
  private raf: number | null = null
  constructor(private r: GraphicsRenderer) { }

  private setCursor(p: TouchPoint) {
    this.r.mouse!.cursorXGlobal = p.x
    this.r.mouse!.cursorYGlobal = p.y
  }

  private schedule() {
    if (this.raf !== null) return
    this.raf = requestAnimationFrame(() => {
      this.raf = null
      this.flushGesture()
    })
  }

  /** Applies the coalesced pinch/pan. Pan first (in current zoom units), then zoom about the finger midpoint. */
  private flushGesture() {
    const r = this.r
    if (!r.mouse) return
    const { x: px, y: py } = this.pendingPan
    this.pendingPan = { x: 0, y: 0 }
    const wanted = this.pendingZoom
    this.pendingZoom = 1
    if (px !== 0 || py !== 0) {
      r.camX += px / r.zoom
      r.camY += py / r.zoom
      r.markDirty('two-finger pan')
    }
    if (Number.isFinite(wanted) && wanted > 0 && Math.abs(wanted - 1) > 1e-4) {
      this.setCursor(this.mid)
      r.setZoom(wanted)
    }
  }

  private beginPinch(touches: TouchPoint[]) {
    const r = this.r
    // abort whatever the first finger had started so it can't commit by accident
    if (r.camMoving) { r.camMoving = false; r.markDirty('pinch cancelled pan') }
    else if (r.mode === r.modes.Select) r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Up)
    this.pinching = true
    this.pinchDist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y)
    this.mid = { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2 }
    this.setCursor(this.mid)
  }

  start(touches: TouchPoint[]) {
    const r = this.r
    if (!r.mouse) return
    if (touches.length >= 2) { this.beginPinch(touches); return }
    this.pinching = false
    this.setCursor(touches[0])
    // hover-style update first so Select/Delete/Move see the node under the finger
    r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Move)
    if (r.mode === r.modes.Navigate || r.mode === r.modes.Select) {
      r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Down)
    }
  }

  move(touches: TouchPoint[]) {
    const r = this.r
    if (!r.mouse) return
    if (touches.length >= 2) {
      // React Native only reports the first finger via onResponderGrant: the second one arrives here
      if (!this.pinching) { this.beginPinch(touches); return }
      const d = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y)
      const mid = { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2 }
      if (this.pinchDist > 1 && d > 1) this.pendingZoom *= d / this.pinchDist
      this.pendingPan.x += mid.x - this.mid.x
      this.pendingPan.y += mid.y - this.mid.y
      this.pinchDist = d
      this.mid = mid
      this.schedule()
      return
    }
    if (this.pinching) return // one finger lifted mid-pinch: ignore until every finger is up
    this.setCursor(touches[0])
    if (!r.didCursorActuallyMove(evt(touches[0].x, touches[0].y))) return
    r.performAction(evt(touches[0].x, touches[0].y), r.mouseAction.Move)
  }

  end(point: TouchPoint | null, remaining: number) {
    const r = this.r
    if (!r.mouse) return
    if (this.pinching) {
      if (remaining === 0) { this.flushGesture(); this.pinching = false }
      return
    }
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
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
  }
}

/**
 * Starts the engine and its render loop. Returns a disposer.
 * Frame pacing: the engine only repaints when dirty (its own _dirty flag); the
 * loop itself idles at a low rate and is paused when the app is backgrounded.
 */
export const InitializeInstance = (
  renderer: GraphicsRenderer,
  onFps?: (fps: number, stats?: string) => void,
  onError?: (message: string) => void
): (() => void) => {
  let raf: number | null = null
  let stopped = false
  let frames = 0
  let frameNo = 0
  let lastFps = performance.now()

  // A font/asset failure must not take the whole render loop down with it
  // (start() sets up the context first, then awaits the font).
  renderer.start().catch((err) => {
    console.error('[editor] engine start failed (fonts?):', err)
    onError?.(`engine start: ${(err as Error)?.message ?? err}`)
  }).then(() => {
    if (stopped) return
    renderer.markDirty('loop start')
    renderer.keyboard?.addKeyEvent(true, Types.default.KeyCodes.DEL, () => renderer.forcefullyRemoveSelectedComponentOnActiveIndex(), { ctrl: false })
    renderer.keyboard?.addKeyEvent(true, Types.default.KeyCodes.R, () => renderer.rotateSelected(), { ctrl: false })
    const loop = (t: number) => {
      if (stopped) return
      try {
        // warm-up: the surface may not have its final size/contents on the first frames
        if (frameNo++ < 240 || frameNo % 120 === 0) renderer.markDirty('warmup')
        renderer.update()
        frames++
      } catch (error) {
        // never let one bad frame kill the loop (and never log the entire scene)
        console.error('[render] frame failed:', (error as Error)?.name, (error as Error)?.message)
      }
      if (t - lastFps >= 500) {
        const fps = Math.round((frames * 1000) / (t - lastFps))
        __setFps(fps)
        onFps?.(fps, renderer.displayRef?.backend.stats?.())
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
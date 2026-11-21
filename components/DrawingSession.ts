import type { GraphicsRenderer } from '../app/editor/engine/Engine'
import { encodeDocument } from '../app/editor/engine/DocumentProperties'
import { drawingProperties, readDrawing } from '../app/editor/engine/DrawingDocument'

/** The editor releases its graphics surface when returning to Home. */
export class DrawingSession {
  identity = Symbol()
  name = 'New Design'
  title = 'New Design'
  destination: string | null = null
  source: string | null = null
  private saved: string | null = null
  private editorState: {
    undo: string[]; redo: string[]; x: number; y: number; zoom: number
  } | null = null

  get dirty() { return this.source !== this.saved }

  newDesign() {
    this.identity = Symbol()
    this.name = this.title = 'New Design'
    this.source = this.saved = this.destination = null
    this.editorState = null
  }

  open(name: string, text: string, destination: string | null = null) {
    const { properties, staged } = readDrawing(text)
    const source = encodeDocument(staged.components, properties, true)
    this.identity = Symbol()
    this.name = name
    this.title = properties.name || name.replace(/\.cnext$/i, '') || 'New Design'
    this.destination = destination
    this.source = this.saved = source
    this.editorState = null
  }

  restore(r: GraphicsRenderer) {
    if (this.source !== null) r.openDocument(this.source)
    if (this.source === null && r.logicDisplay) {
      this.rename(r, this.title)
      this.source = this.saved = r.saveDocument()
      r.undoStack = [r.logicDisplay.exportJSON()]
    }
    const state = this.editorState
    if (!state) return
    r.undoStack = state.undo
    r.redoStack = state.redo
    r.camX = state.x
    r.camY = state.y
    r.zoom = r.targetZoom = state.zoom
  }

  rename(r: GraphicsRenderer, title: string) {
    const properties = drawingProperties(r)
    this.title = title.trim() || 'New Design'
    r.documentProperties = { ...properties, name: this.title }
    r.markDirty('drawing title')
  }

  capture(r: GraphicsRenderer) {
    if (!r.logicDisplay) return
    const source = r.saveDocument()
    if (this.source === null && r.logicDisplay.components.length === 0) this.saved = source
    this.source = source
    this.editorState = {
      undo: r.undoStack, redo: r.redoStack, x: r.camX, y: r.camY, zoom: r.targetZoom
    }
  }

  markSaved(name: string, source: string, destination = this.destination) {
    this.destination = destination
    this.name = name
    this.saved = source
  }
}

export const drawingSession = new DrawingSession()

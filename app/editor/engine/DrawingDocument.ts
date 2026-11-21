import { defaultDocumentProperties, decodeDocument, encodeDocument, measurementUnits } from './DocumentProperties'
import type { GraphicsRenderer } from './Engine'
import { isComponentList, LogicDisplay } from './Logic'

export function readDrawing(source: string) {
  const { components, properties } = decodeDocument(source, true)
  if (!properties || !isComponentList(components)) throw new Error('Invalid .cnext components')
  const staged = new LogicDisplay()
  staged.importJSON(components, staged.components)
  return { properties, staged }
}

export function openDocument(this: GraphicsRenderer, source: string): void {
  const { properties, staged } = readDrawing(source)
  const snapshot = staged.exportJSON()

  this.setMode(this.modes.Select)
  this.temporarySelectedComponent = this.lastSelectedComponent = null
  this.handles = []
  this.dragHandle = null
  this.logicDisplay = staged
  this.cleanUpBeforeImport()
  this.documentProperties = properties
  this.unitMeasure = properties.measurementUnit
  this.unitConversionFactor = measurementUnits[properties.measurementUnit].factor
  this.measurementPrecision = properties.measurementPrecision
  this.camMoving = false
  this.camX = this.camY = 0
  this.targetZoom = this.zoom = 1
  this.fitDocumentPaper()
  this.undoStack = [snapshot]
  this.redoStack = []
  this.postDoAfterComponentImport()
}

export function drawingProperties(r: GraphicsRenderer) {
  return r.documentProperties ?? {
    ...defaultDocumentProperties(),
    measurementUnit: r.unitMeasure as keyof typeof measurementUnits,
    measurementPrecision: r.measurementPrecision
  }
}

export function saveDocument(this: GraphicsRenderer): string {
  if (!this.logicDisplay) throw new Error('The drawing is not ready')
  const properties = drawingProperties(this)
  let components = this.logicDisplay.components
  // Move mode temporarily highlights the selected object in the model.
  if (this.selectedComponent !== null && this.previousColor !== null) {
    components = components.slice()
    const index = this.selectedComponent
    components[index] = { ...components[index], color: this.previousColor,
      radius: this.previousRadius ?? components[index].radius }
  }
  return encodeDocument(components, properties, true)
}

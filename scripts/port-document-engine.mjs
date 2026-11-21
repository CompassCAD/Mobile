// Keep the native renderer and input adapters when porting Desktop document features.
export function portDocumentEngine(engine, desktop) {
  const slice = (start, end) => {
    const a = desktop.indexOf(start), b = desktop.indexOf(end, a + start.length)
    if (a < 0 || b < 0) throw new Error('Desktop document API changed: ' + start)
    return desktop.slice(a, b)
  }
  const paper = slice('  private paperFitZoom()', '  setDocumentProperties(')
    .replaceAll('clientWidth', 'width').replaceAll('clientHeight', 'height')
  const frame = slice('  fitDocumentPaper()', '  applyPreferences()')
    .replace('ctx.strokeRect(x + margin * this.zoom', 'drawPaperMargin(ctx, x + margin * this.zoom')
    .replace(/ *ctx\.setLineDash\([^\n]+\n/g, '')
    .replace("getLocaleKey('documentProperties.custom')", "'Custom size'")
    .replace('getLocaleKey(`documentProperties.${cell.field}`)', 'titleBlockLabels[cell.field]')
    .replace(/    drawFrameWordmark\(ctx, .*\)/, "    if (this.displayRef) drawFrameWordmark(this.displayRef, () => this.markDirty('title block'), sx(brand.x), sy(brand.y), brand.width * this.zoom, brand.height * this.zoom)")
    .replace('    ctx.rect(x, y, width, height)\n    ctx.clip()\n', '')
  if (engine.includes('  fitDocumentPaper()')) {
    engine = engine.replace(slice('  private paperFitZoom()', '  setDocumentProperties('), () => paper)
      .replace(slice('  fitDocumentPaper()', '  applyPreferences()'), () => frame)
      .replace(/^import .*FrameWordmark.*\n/m, '')
      .replaceAll('../utils/DocumentProperties', './DocumentProperties')
      .replaceAll('../utils/DocumentFrame', './DocumentFrame')
  } else {
    engine = engine.replace('  cleanUpBeforeImport()', () =>
      '  documentProperties: DocumentProperties | null = null\n  measurementPrecision = 2\n' +
      paper + frame + '  cleanUpBeforeImport()')
      .replace('    this.clearGrid()\n', '    this.clearGrid()\n    this.drawDocumentPaper()\n')
      .replace('    this.flushBatchedPaths()\n    this.drawRules()', '    this.flushBatchedPaths()\n    this.drawDocumentFrame()\n    this.drawRules()')
      .replace('if (newZoom <= 0.25 || newZoom >= 15) return', 'newZoom = this.clampZoom(newZoom)')
      .replace("distance.toFixed(2) + ''", "distance.toFixed(this.measurementPrecision) + ' '")
      .replace('/ 100).toFixed(2)}m)', '* this.unitConversionFactor).toFixed(this.measurementPrecision)} ${this.unitMeasure})')
      .replace('pic.x + width,', 'pic.x + width * (pic.imageScale ?? 1),')
      .replace('pic.y + height\n', 'pic.y + height * (pic.imageScale ?? 1)\n')
      .replace('pic.pictureSource, pic.opacity, rotation)', 'pic.pictureSource, pic.opacity, rotation, pic.imageScale ?? 1)')
      .replace('basedURL: string, opacity: number, rotation: number = 0)', 'basedURL: string, opacity: number, rotation: number = 0, imageScale = 1)')
      .replace('as BackendImage),\n        opacity,\n        rotation', 'as BackendImage),\n        opacity,\n        rotation,\n        imageScale')
      .replace('img: BackendImage | null,\n    opacity: number,\n    rotation: number = 0', 'img: BackendImage | null,\n    opacity: number,\n    rotation: number = 0,\n    imageScale = 1')
      .replace('img.naturalWidth * this.zoom', 'img.naturalWidth * imageScale * this.zoom')
      .replace('img.naturalHeight * this.zoom', 'img.naturalHeight * imageScale * this.zoom')
      .replace("    this.cleanLog('saving state')", () => slice('    for (const component of this.logicDisplay?.components ?? []) {\n      const line =', "    this.cleanLog('saving state')") + "    this.cleanLog('saving state')")
    engine = engine.replace("import { LogicDisplay }", "import { type DocumentProperties, worldPaperDimensions } from './DocumentProperties'\nimport { documentTitleBlockLayout } from './DocumentFrame'\nimport { LogicDisplay }")
  }
  engine = engine.replace('import { documentTitleBlockLayout }', 'import { drawPaperMargin, documentTitleBlockLayout, titleBlockLabels }')
  engine = engine.replace('if (this.undoStack.length > 0) {\n      // Remove the last state', 'if (this.undoStack.length > 1) {\n      // Remove the last state')
    .replace(/      \/\/ Move the current state to the undoStack[\s\S]*?const state = this.redoStack.pop\(\)/,
      '      const state = this.redoStack.pop()!\n      this.undoStack.push(state)')
  return engine.replace('export class GraphicsRenderer {',
    "import { drawFrameWordmark } from '../platform/FrameWordmark'\nimport { openDocument, saveDocument } from './DrawingDocument'\n\nexport class GraphicsRenderer {\n  openDocument = openDocument\n  saveDocument = saveDocument")
}

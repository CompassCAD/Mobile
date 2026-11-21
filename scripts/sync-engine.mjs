// Usage: bun scripts/sync-engine.mjs /path/to/NextDesktop
// Re-imports the upstream engine and re-applies the mobile seams. Re-run after every upstream merge.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { portDocumentEngine } from './port-document-engine.mjs'
import { join } from 'node:path'

const up = process.argv[2]
if (!up) { console.error('usage: bun scripts/sync-engine.mjs <NextDesktop checkout>'); process.exit(1) }
const src = join(up, 'src/renderer/src/engine')
const dst = join(import.meta.dirname, '../app/editor/engine')
mkdirSync(join(dst, 'fontobene'), { recursive: true })
for (const f of ['Component.ts', 'Logic.ts', 'Types.ts', 'CacheDatas.ts', 'Input.ts'])
  copyFileSync(join(src, f), join(dst, f))
for (const f of ['FontobeneParser.ts', 'ansifont.bene', 'ansifont-beta-cjk.bene', 'newstroke.bene'])
  copyFileSync(join(src, 'fontobene', f), join(dst, 'fontobene', f))

const rep = (s, a, b, label) => {
  const out = typeof a === 'string' ? s.split(a).join(b) : s.replace(a, b)
  if (out === s) console.warn('[sync] no match for:', label ?? String(a).slice(0, 60))
  return out
}

// ---- Derakuma: accept a resolver in addition to a URL ----
let d = readFileSync(join(src, 'fontobene/Derakuma.ts'), 'utf8')
d = rep(d, 'private async load(source: string, loadMethod: FontLoadMethod | string): Promise<void> {\n    const rawContent = await this.fetchBeneFile(source, loadMethod);',
  'private async load(source: BeneSource, loadMethod: FontLoadMethod | string): Promise<void> {\n    const rawContent = typeof source === \'function\' ? await source() : await this.fetchBeneFile(source, loadMethod);', 'derakuma load')
d = rep(d, 'constructor(source: string, loadMethod', 'constructor(source: BeneSource, loadMethod', 'derakuma ctor')
d = rep(d, 'export class DerakumaParser {', '/** A URL to fetch, or an async function that returns the raw .bene text (used on React Native). */\nexport type BeneSource = string | (() => Promise<string>)\n\nexport class DerakumaParser {', 'derakuma type')
writeFileSync(join(dst, 'fontobene/Derakuma.ts'), d)

// ---- Engine ----
const desktopEngine = readFileSync(join(src, 'Engine.ts'), 'utf8').replaceAll('\r\n', '\n')
let e = desktopEngine
e = rep(e, /import (\w+) from '\.\.\/assets\/cursors\/[\w-]+\.svg'\n/g, "const $1 = ''\n", 'cursor imports')
e = rep(e, "import { callTextPrompt } from '@renderer/components/TextPrompt'", "import { callTextPrompt } from '../platform/TextPrompt'")
e = rep(e, "import AnsiFont from './fontobene/ansifont.bene'\nimport AnsiCJK from './fontobene/ansifont-beta-cjk.bene'",
  "import { AnsiFont, AnsiCJK } from '../platform/FontAssets'\nimport { PixelRatio } from 'react-native'\nimport * as Clipboard from 'expo-clipboard'\nimport type { RenderSurface } from '../platform/RenderSurface'\nimport { BatchPath, type Context2DLike, type BackendImage } from '../render/Context2DLike'")
e = rep(e, "import { isDevModeEnabled } from '../exports'", "// engine debug overlay is desktop-layout only; opt in with globalThis.__CCAD_ENGINE_DEBUG__ = true\nconst isDevModeEnabled = (): boolean => !!(globalThis as any).__CCAD_ENGINE_DEBUG__")
e = rep(e, 'let fps = 0\n', 'let fps = 0\nexport const __setFps = (v: number): void => {\n  fps = v\n}\n')
e = rep(e, 'HTMLCanvasElement | null', 'RenderSurface | null')
e = rep(e, 'CanvasRenderingContext2D | null', 'Context2DLike | null')
e = rep(e, "Path2D", 'BatchPath')
e = rep(e, 'lineJoin: CanvasLineJoin', "lineJoin: 'miter' | 'round' | 'bevel'")
e = rep(e, 'HTMLImageElement', 'BackendImage')
e = rep(e, /window\.devicePixelRatio/g, 'PixelRatio.get()')
e = rep(e, 'g.commands.reduce((m, c) =>', 'g.commands.reduce((m: number, c: { x: number }) =>', 'implicit any 1')
e = rep(e, 'const drawDebugLine = (y, text) =>', 'const drawDebugLine = (y: number, text: string) =>', 'implicit any 2')
// images
e = rep(e, /const img = new Image\(\)\n\s*img\.crossOrigin = 'anonymous'\n\s*img\.src = basedURL\n\s*img\.onerror = \(\) => \{\n\s*this\.imageCache\.set\(basedURL, 'ERROR'\)\n\s*\}\n\s*img\.onload = \(\) => \{\n\s*this\.imageCache\.set\(basedURL, img\)\n\s*this\._isQuadtreeDirty = true\n\s*this\.markDirty\('picture dimensions resolved'\)\n\s*\}/,
  `this.imageCache.set(basedURL, 'ERROR') // placeholder while loading: avoids duplicate loads
      this.displayRef!
        .loadImage(basedURL)
        .then((img) => {
          this.imageCache.set(basedURL, img)
          this._isQuadtreeDirty = true
          this.markDirty('picture dimensions resolved')
        })
        .catch(() => this.imageCache.set(basedURL, 'ERROR'))`, 'drawPicture')
// clipboard
e = rep(e, 'await navigator.clipboard.writeText(this._copiableDebugStrings)', 'await Clipboard.setStringAsync(this._copiableDebugStrings)')
e = rep(e, /pasteWhateverTheFuckIsInTheClipboard\(\) \{[\s\S]*?\n  \}\n\n  rotateSelected\(\)/,
  `pasteWhateverTheFuckIsInTheClipboard() {
    Clipboard.getStringAsync()
      .then((text) => {
        if (!text) return
        if (text.includes('active') && text.includes('type')) return // CompassCAD component: WIP upstream
        this.logicDisplay?.addComponent(new Label(this.getCursorXLocal(), this.getCursorYLocal(), text))
        this.saveState()
      })
      .catch((err) => console.log(\`err: error reading clipboard: \${err}\`))
  }

  rotateSelected()`, 'paste')
// size badge: vector text (no fillText dependence, identical on both backends)
e = rep(e, 'private _measureTextCached(text: string): number {',
  `private _vectorTextWidth(text: string, size: number): number {
    const glyphs = this._getSpacedGlyphs(text)
    if (!glyphs) return text.length * size * 5
    let minX = Infinity, maxX = -Infinity
    for (const g of glyphs) for (const c of g.commands) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x }
    return maxX >= minX ? (maxX - minX) * size : 0
  }

  private _measureTextCached(text: string): number {`, 'vtw')
e = rep(e, 'this._measureTextCached(displayText)', 'this._vectorTextWidth(displayText, 1.6)')
e = rep(e, /this\.context\.fillStyle = '#fff'\n\s*this\.context\.textBaseline = 'middle'\n\s*this\.context\.textAlign = 'center'\n\s*const secondDummyLine = component as Line\n\s*this\.context\.fillText\(\n\s*displayText,\n\s*\(\(secondDummyLine\.x2 - secondDummyLine\.x1\) \/ 2 \+ secondDummyLine\.x1 \+ this\.cOutX\) \*\n\s*this\.zoom,\n\s*boxY \+ 15\n\s*\)/,
  `this.drawRawFontobeneAtLocation(
        (((component as Line).x2 - (component as Line).x1) / 2 + (component as Line).x1 + this.cOutX) * this.zoom,
        boxY + 12.5,
        displayText,
        '#ffffff',
        1.6,
        1.2,
        1,
        0,
        'center',
        'middle'
      )`, 'badge text')
// ---- RangeError hardening + lifecycle ----
e = rep(e, "    this.undoStack.push(JSON.stringify(this.logicDisplay?.components))\n    this.cleanLog(this.undoStack)\n    if (this.undoStack.length > this.maximumStack) {\n      this.undoStack.shift()\n    }",
`    let snap: string | null = null
    try {
      snap = JSON.stringify(this.logicDisplay?.components)
    } catch (err) {
      // "Invalid string length" on very large scenes: drop history instead of crashing the frame
      if (!(err instanceof RangeError)) throw err
      this.undoStack.length = 0
    }
    if (snap !== null) this.undoStack.push(snap)
    if (this.undoStack.length > this.maximumStack) {
      this.undoStack.shift()
    }
    let undoChars = 0
    for (const s of this.undoStack) undoChars += s.length
    while (this.undoStack.length > 1 && undoChars > 24_000_000) undoChars -= this.undoStack.shift()!.length`, 'saveState')
e = rep(e, '  getDistance(x1: number, y1: number, x2: number, y2: number): number {',
`  disposed = false
  /** Releases everything the engine holds. Stop the render loop first. */
  dispose(): void {
    this.disposed = true
    this.undoStack = []
    this.redoStack = []
    this.imageCache.clear()
    this._pathBatches.clear()
    this._quadtree = null
    this.handles = []
    this.onComponentChangeCallback = null
    this.onComponentArrayChanged = null
    this.onModeChange = null
    this.onZoomUpdate = null
    this.displayRef?.backend.dispose()
    this.context = null
    this.displayRef = null
  }
  getDistance(x1: number, y1: number, x2: number, y2: number): number {`, 'dispose')
e = rep(e, '  update() {\n    if (!this._dirty) {', '  update() {\n    if (this.disposed || !this.displayRef) return\n    if (!this._dirty) {', 'update guard')
e = rep(e, '    this._dirty = false\n    this.offsetX = this.displayRef!.offsetLeft', '    this._dirty = false\n    this.displayRef!.backend.beginFrame()\n    this.offsetX = this.displayRef!.offsetLeft', 'beginFrame')
e = rep(e, '    //this.fontobeneTest();\n    // Useful event handlers for later on ;)', '    this.displayRef?.backend.endFrame()\n    // Useful event handlers for later on ;)', 'endFrame')
// input: replace DOM wiring with the touch adapter
const idx = e.indexOf('export const InitializeInstance')
if (idx < 0) throw new Error('InitializeInstance not found')
e = e.slice(0, idx) + "export { InitializeInstance } from '../input/TouchInput'\n"
e = '// @generated by scripts/sync-engine.mjs from CompassCAD/NextDesktop. Do not edit by hand: edit the script.\n// @ts-nocheck-free\n' + e
e = e.replace('// @ts-nocheck-free\n', '')
writeFileSync(join(dst, 'Engine.ts'), portDocumentEngine(e, desktopEngine))
console.log('[sync] engine synced')

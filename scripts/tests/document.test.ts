import { expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { defaultDocumentProperties } from '../../app/editor/engine/DocumentProperties'
import { Line, Shape, BoundBox } from '../../app/editor/engine/Component'

mock.module('../../app/editor/platform/FrameWordmark', () => ({ drawFrameWordmark() {} }))
mock.module('react-native', () => ({ PixelRatio: { get: () => 1 } }))
mock.module('expo-clipboard', () => ({}))
mock.module('../../app/editor/platform/FontAssets', () => ({
  AnsiFont: async () => readFileSync('app/editor/engine/fontobene/ansifont.bene', 'utf8'),
  AnsiCJK: async () => readFileSync('app/editor/engine/fontobene/ansifont.bene', 'utf8')
}))
const { GraphicsRenderer } = await import('../../app/editor/engine/Engine')

const document = { ...defaultDocumentProperties(), canvas: 'paper', paper: 'custom',
  widthMm: 200, heightMm: 400, scaleDenominator: 200, name: 'Floor plan', measurementUnit: 'ft', measurementPrecision: 4 }
const common = { active: true, color: '#ff8800', radius: 2, opacity: 75, rotation: 15, name: 'Detail' }
const point = { x: 12, y: 18 }
const span = { x1: 0, y1: 0, x2: 3, y2: 4 }
const geometry = [
  { type: 1, ...point }, { type: 2, ...span, fixedLength: 5, groupId: 'g', groupName: 'Walls' },
  { type: 3, ...span }, { type: 4, ...span }, { type: 5, ...span, x3: 4, y3: 8 },
  { type: 6, ...span }, { type: 7, ...point, fontSize: 12, text: 'Room A' },
  { type: 8, ...point, components: [{ ...common, type: 11, ...span }] },
  { type: 9, ...point, imageScale: 0.25, pictureSource: 'data:image/png;base64,AA==' },
  { type: 10, vectors: [point, { x: 3, y: 4 }, { x: 0, y: 0 }], strokeColor: '#aaa', enableStroke: true },
  { type: 11, ...span },
].map(c => ({ ...common, ...c }))
const drawing = { format: 'CompassCAD.Next', version: 1, document, components: geometry }

test('opens and saves a Desktop v1 document with every component type', () => {
  const r = new GraphicsRenderer(null, 400, 800)
  r.openDocument(JSON.stringify(drawing))
  expect(r.logicDisplay!.components[1]).toBeInstanceOf(Line)
  expect((r.logicDisplay!.components[7] as Shape).components[0]).toBeInstanceOf(BoundBox)
  expect(r.zoom).toBeCloseTo(0.04)
  expect(r.unitConversionFactor).toBeCloseTo(1 / 30.48)
  expect(r.measurementPrecision).toBe(4)
  expect(JSON.parse(r.saveDocument())).toMatchObject(drawing)
  expect(r.undoStack).toEqual([r.logicDisplay!.exportJSON()])
  expect(r.redoStack).toEqual([])
})

test('rejects invalid nested geometry, version or paper settings without replacing the drawing', () => {
  const r = new GraphicsRenderer(null, 400, 800)
  r.openDocument(JSON.stringify(drawing))
  const before = r.saveDocument()
  const history = r.undoStack
  for (const patch of [{ version: 2 }, { document: { ...document, scaleNumerator: 0 } },
    { components: [{ ...geometry[7], components: [null] }] }]) {
    expect(() => r.openDocument(JSON.stringify({ ...drawing, ...patch }))).toThrow()
    expect(r.saveDocument()).toBe(before)
    expect(r.undoStack).toBe(history)
  }
})

test('accepts older title-block defaults and empty infinite drawings', () => {
  const r = new GraphicsRenderer(null, 400, 800)
  r.openDocument(JSON.stringify({ ...drawing, components: [], document: {
    ...document, showTitleBlock: undefined, canvas: 'infinite'
  } }))
  expect(r.documentProperties?.showTitleBlock).toBe(true)
  expect(r.zoom).toBe(1)
  expect(JSON.parse(r.saveDocument()).components).toEqual([])
})

test('saving while a component is highlighted preserves its drawing style', () => {
  const r = new GraphicsRenderer(null, 400, 800)
  r.openDocument(JSON.stringify(drawing))
  r.setMode(r.modes.Move)
  r.selectComponent(1)
  expect(JSON.parse(r.saveDocument()).components[1]).toMatchObject(geometry[1])
  expect(r.selectedComponent).toBe(1)
})

test('paper and title-block visibility control the drawn sheet independently of geometry', async () => {
  const r = new GraphicsRenderer(null, 400, 800)
  await r.fb.ready()
  const rectangles: number[][] = []
  r.context = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    strokeRect(...coords: number[]) { rectangles.push(coords) }
  } as unknown as NonNullable<typeof r.context>
  for (const [showPaper, showTitleBlock, expected] of [
    [true, true, 9], [true, false, 1], [false, true, 0]
  ] as const) {
    r.openDocument(JSON.stringify({ ...drawing, document: { ...document, showPaper, showTitleBlock } }))
    rectangles.length = 0
    r.drawDocumentPaper()
    r.drawDocumentFrame()
    expect(rectangles).toHaveLength(expected)
    expect(JSON.parse(r.saveDocument()).components).toHaveLength(geometry.length)
  }
})

test('returning Home preserves edits for Save As and restores the editor history', async () => {
  const { DrawingSession } = await import('../../components/DrawingSession')
  const session = new DrawingSession()
  session.open('Plan.cnext', JSON.stringify(drawing))
  const editor = new GraphicsRenderer(null, 400, 800)
  session.restore(editor)
  editor.logicDisplay!.addComponent(new Line(10, 15, 20, 25))
  editor.saveState()
  editor.camX = 30
  session.capture(editor)
  editor.dispose()
  expect(session.dirty).toBe(true)
  const source = session.source!
  expect(JSON.parse(source).components).toHaveLength(12)
  expect(() => session.open('broken.cnext', '{}')).toThrow()
  expect(session.source).toBe(source)
  session.markSaved('Revision.cnext', source)
  const resumed = new GraphicsRenderer(null, 400, 800)
  session.restore(resumed)
  expect(resumed.saveDocument()).toBe(source)
  expect(resumed.camX).toBe(30)
  expect(resumed.undoStack).toHaveLength(2)
  expect(session.dirty).toBe(false)
})

test('renaming persists the title across undo, redo and saving to a different filename', async () => {
  const { DrawingSession } = await import('../../components/DrawingSession')
  const session = new DrawingSession()
  session.open('Plan.cnext', JSON.stringify(drawing))
  const r = new GraphicsRenderer(null, 400, 800)
  session.restore(r)
  session.rename(r, 'North wing')
  const before = r.logicDisplay!.components.length
  r.logicDisplay!.addComponent(new Line(1, 2, 3, 4))
  r.saveState()
  r.undo()
  r.undo()
  expect(r.logicDisplay!.components).toHaveLength(before)
  r.redo()
  expect(r.logicDisplay!.components).toHaveLength(before + 1)
  r.undo()
  expect(r.logicDisplay!.components).toHaveLength(before)
  session.capture(r)
  expect(JSON.parse(session.source!).document.name).toBe('North wing')
  session.markSaved('Export.cnext', session.source!, 'file:///Export.cnext')
  expect(session.title).toBe('North wing')
  expect(session.dirty).toBe(false)
  session.open('Other.cnext', JSON.stringify(drawing))
  expect(session.destination).toBeNull()
})

test('New Design starts an independent drawing after reopening a recent file', async () => {
  const { DrawingSession } = await import('../../components/DrawingSession')
  const session = new DrawingSession()
  session.open('Plan.cnext', JSON.stringify(drawing), 'file:///Designs/Plan.cnext')
  const previous = session.identity
  session.newDesign()
  expect(session.source).toBeNull()
  expect(session.title).toBe('New Design')
  expect(session.destination).toBeNull()
  expect(session.identity).not.toBe(previous)
  expect(session.dirty).toBe(false)
})

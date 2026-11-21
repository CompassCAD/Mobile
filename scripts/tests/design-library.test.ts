import { expect, mock, test } from 'bun:test'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync,
  copyFileSync, statSync, rmSync, utimesSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

const root = mkdtempSync(join(tmpdir(), 'compass-designs-'))
class Entry {
  uri: string
  constructor(parent: string | Entry, ...segments: string[]) {
    this.uri = join(typeof parent === 'string' ? parent : parent.uri, ...segments)
  }
  get name() { return basename(this.uri) }
  get exists() { return existsSync(this.uri) }
}
class File extends Entry {
  get parentDirectory() { return new Directory(dirname(this.uri)) }
  get modificationTime() { return statSync(this.uri).mtimeMs }
  get size() { return statSync(this.uri).size }
  async write(content: string, options?: { encoding: 'base64' }) { writeFileSync(this.uri, content, options?.encoding) }
  async text() { return readFileSync(this.uri, 'utf8') }
  async move(to: File) { copyFileSync(this.uri, to.uri); this.delete(); this.uri = to.uri }
  delete() { rmSync(this.uri) }
}
class Directory extends Entry {
  create() { mkdirSync(this.uri, { recursive: true }) }
  createFile(name: string) { const file = new File(this, name); writeFileSync(file.uri, ''); return file }
  list() { return readdirSync(this.uri).map(name => new File(this, name)) }
}
mock.module('expo-file-system', () => ({ Directory, File, Paths: { document: root } }))
mock.module('expo-file-system/legacy', () => ({ writeAsStringAsync: async (uri: string, text: string) => writeFileSync(uri, text) }))
mock.module('expo-modules-core', () => ({ requireOptionalNativeModule: () => null, uuid: { v4: randomUUID } }))
mock.module('react-native', () => ({ Platform: { OS: 'ios' }, PixelRatio: { get: () => 1 } }))

test('automatic saves survive a directory rescan, retain distinct same-name drawings and update recents', async () => {
  try {
    const { saveDesign, recentDesigns, saveDrawingPreview } = await import('../../components/DrawingFiles')
    const first = await saveDesign('first', 'Sketch', null)
    const other = await saveDesign('second', 'Sketch', null)
    expect(first.uri).not.toBe(other.uri)
    const older = new Date(1000)
    utimesSync(other.uri, older, older)
    const updated = await saveDesign('revision', 'Updated sketch', first.uri)
    expect(updated.uri).toBe(first.uri)
    expect(readFileSync(first.uri, 'utf8')).toBe('revision')
    expect(readFileSync(other.uri, 'utf8')).toBe('second')
    expect((await recentDesigns()).map(d => d.title)).toEqual(['Updated sketch', 'Sketch'])
    const exported = new File(root, 'external.cnext')
    await exported.write('original')
    await saveDesign('imported copy', 'Imported', exported.uri)
    expect(await exported.text()).toBe('original')
    expect(await recentDesigns()).toHaveLength(3)
    for (let n = 0; n < 5; n++) {
      const design = await saveDesign('drawing', 'Page ' + n, null)
      const edited = new Date(Date.now() + (n + 1) * 10000)
      utimesSync(design.uri, edited, edited)
    }
    expect((await recentDesigns(5)).map(item => item.title)).toEqual(['Page 4', 'Page 3', 'Page 2', 'Page 1', 'Page 0'])
    expect(await recentDesigns()).toHaveLength(8)
    await saveDrawingPreview(first.uri, 'data:image/jpeg;base64,/9j/2Q==')
    const reopened = (await recentDesigns()).find(item => item.uri === first.uri)!
    expect(readFileSync(reopened.preview!).toString('hex')).toBe('ffd8ffd9')
    expect(reopened.modified).toBe(statSync(first.uri).mtimeMs)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

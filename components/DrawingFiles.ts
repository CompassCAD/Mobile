import { Directory, File, Paths } from 'expo-file-system'
import { copyAsync, deleteAsync, readAsStringAsync, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy'
import { requireOptionalNativeModule, uuid } from 'expo-modules-core'
import { Platform } from 'react-native'

const androidStorage = Platform.OS === 'android' ? requireOptionalNativeModule<{
  directoryUri(): string
  writeDesign(name: string, source: string): Promise<void>
}>('CompassDesignStorage') : null

function designsDirectory() {
  if (androidStorage) return new Directory(androidStorage.directoryUri())
  const dir = new Directory(Paths.document, 'Designs')
  dir.create({ intermediates: true, idempotent: true })
  return dir
}

export async function pickDrawing() {
  const file = await File.pickFileAsync({})
  if (file.canceled) return null
  return { name: file.result.name, source: await file.result.text() }
}

export async function saveDrawingCopy(source: string, name: string) {
  const directory = await Directory.pickDirectoryAsync()
  const file = directory.createFile(name, 'application/octet-stream')
  await file.write(source)
  return { name: file.name, uri: file.uri }
}

const recentListeners = new Set<() => void>()

export function subscribeRecentDesigns(listener: () => void) {
  recentListeners.add(listener)
  return () => { recentListeners.delete(listener) }
}

function refreshRecents() { recentListeners.forEach(listener => listener()) }

export type RecentDesign = { uri: string; title: string; modified: number; preview?: string; previewModified?: number }

export async function recentDesigns(limit?: number): Promise<RecentDesign[]> {
  const dir = designsDirectory()
  const files = dir.list().filter((f): f is File => f instanceof File && f.name.endsWith('.cnext'))
  const sorted = files.map(file => ({ file, modified: file.modificationTime ?? 0 }))
    .sort((a, b) => b.modified - a.modified || a.file.name.localeCompare(b.file.name))
  return Promise.all(sorted.slice(0, limit).map(async ({ file, modified }) => {
    const preview = new File(dir, file.name + '.jpg')
    const label = new File(dir, file.name + '.title')
    const hasCover = preview.exists && preview.size > 0
    return {
      uri: file.uri, title: label.exists ? await label.text() : file.name.slice(0, -6),
      modified, preview: hasCover ? preview.uri : undefined, previewModified: hasCover ? preview.modificationTime ?? 0 : 0
    }
  }))
}

export async function saveDesign(source: string, title: string, destination: string | null) {
  const dir = designsDirectory()
  const base = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 60).trim() || 'New Design'
  let file = new File(dir, base + '.cnext')
  if (destination && new File(destination).parentDirectory.uri === file.parentDirectory.uri) {
    file = new File(destination)
  } else {
    let suffix = 2
    while (file.exists) file = new File(dir, base + ' (' + suffix++ + ').cnext')
  }
  if (androidStorage) {
    await androidStorage.writeDesign(file.name, source)
  } else if (Platform.OS === 'ios') {
    // This Expo API uses Foundation's atomic file replacement on iOS.
    await writeAsStringAsync(file.uri, source)
  } else {
    const temp = new File(dir, uuid.v4() + '.tmp')
    try {
      await temp.write(source)
      await temp.move(file, { overwrite: true })
    } catch (error) {
      if (temp.exists) temp.delete()
      throw error
    }
  }
  // Recents are discovered from the drawing files, so a thumbnail failure cannot hide a save.
  const meta = new File(dir, file.name + '.title')
  try {
    if (!meta.exists) dir.createFile(meta.name, 'text/plain')
    await meta.write(title)
  } catch (error) { console.warn('Could not store recent drawing title', error) }
  refreshRecents()
  return { name: file.name, uri: file.uri }
}

export async function saveDrawingPreview(uri: string, snapshot: string) {
  if (!snapshot.startsWith('data:image/jpeg;base64,')) {
    throw new Error('Expected a JPEG data URI for the drawing cover')
  }
  const file = new File(uri)
  const preview = new File(file.parentDirectory, file.name + '.jpg')
  if (!preview.exists) file.parentDirectory.createFile(preview.name, 'image/jpeg')
  await preview.write(snapshot.slice(snapshot.indexOf(',') + 1), { encoding: 'base64' })
  refreshRecents()
}

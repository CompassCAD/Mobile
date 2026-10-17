import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import type { BeneSource } from '../engine/fontobene/Derakuma'

/** Derakuma loads these through a resolver (no fetch of bundler URLs needed). */
const makeSource = (mod: number): BeneSource => async () => {
  const asset = await Asset.fromModule(mod).downloadAsync()
  const uri = asset.localUri ?? asset.uri
  if (uri.startsWith('file://')) return new File(uri).text()
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`)
  return res.text()
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const AnsiFont: BeneSource = makeSource(require('../engine/fontobene/ansifont.bene'))
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const AnsiCJK: BeneSource = makeSource(require('../engine/fontobene/ansifont-beta-cjk.bene'))

import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import type { RenderSurface } from './RenderSurface'
import type { BackendImage } from '../render/Context2DLike'

const images = new WeakMap<RenderSurface, BackendImage | null>()

export function drawFrameWordmark(surface: RenderSurface, invalidate: () => void,
  x: number, y: number, width: number, height: number) {
  if (!images.has(surface)) {
    images.set(surface, null)
    const asset = Asset.fromModule(require('../../../assets/images/frame-wordmark.png'))
    void asset.downloadAsync().then(async () => {
      const source = await new File(asset.localUri ?? asset.uri).base64()
      const image = await surface.loadImage('data:image/png;base64,' + source)
      images.set(surface, image)
      invalidate()
    }).catch(error => console.warn('Could not load the title-block wordmark', error))
  }
  const image = images.get(surface)
  if (!image) return
  const scale = Math.min(width / 614, height / 53)
  const w = 614 * scale, h = 53 * scale
  surface.backend.ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h)
}

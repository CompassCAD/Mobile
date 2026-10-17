type Handler = (message: string, resolve: (v: string | null) => void) => void
let handler: Handler | null = null
/** EditorView registers a React modal here; the engine just awaits the promise. */
export const registerTextPrompt = (h: Handler | null) => { handler = h }
export const callTextPrompt = (message: string): Promise<string | null> =>
  new Promise((resolve) => {
    if (!handler) { console.warn('[TextPrompt] no handler mounted'); resolve(null); return }
    handler(message, resolve)
  })
export const prompt = callTextPrompt

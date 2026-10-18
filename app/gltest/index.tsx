import { GLView } from 'expo-gl'
import { useRef, useState } from 'react'
import { Pressable, PixelRatio, StyleSheet, Text, View } from 'react-native'
import { GraphicsRenderer } from '../editor/engine/Engine'
import { RenderSurface } from '../editor/platform/RenderSurface'
import { GLESBackend } from '../editor/render/GLESBackend'

/**
 * Standalone GL probe (no engine, no renderer classes). Open with:
 *   adb shell am start -a android.intent.action.VIEW -d "undifer://gltest"
 * Each stage is drawn every frame. Report which of these you can SEE:
 *   A  whole surface magenta           -> GLView presents at all
 *   B  big yellow triangle (clip space) -> raw draw works
 *   C  green square at (40,40) 120x120 CSS px + cyan 48px square bottom-right
 *                                       -> same program/stride/u_res as GLESBackend
 * Pick stages with the buttons at the bottom (no auto-cycling):
 *   D  the REAL GLESBackend, drawn through the Context2DLike API (rect, circle, rounded rect, lines)
 *   E  the REAL engine (GraphicsRenderer) on the REAL GLESBackend, no toolbar/overlays
 *   "nb" variants disable GL blending (the only state GLESBackend sets that C does not)
 */
const VS = `attribute vec2 a_pos; attribute vec4 a_col; uniform vec2 u_res; varying vec4 v_col;
void main(){ vec2 c=(a_pos/u_res)*2.0-1.0; gl_Position=vec4(c.x,-c.y,0.0,1.0); v_col=a_col; }`
const FS = `precision mediump float; varying vec4 v_col; void main(){ gl_FragColor=v_col; }`
const VS_RAW = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0); }`
const FS_RAW = `precision mediump float; void main(){ gl_FragColor=vec4(1.0,0.9,0.0,1.0); }`

export default function GLTest() {
  const [info, setInfo] = useState('waiting for GL context…')
  type Stage = 'A' | 'B' | 'C' | 'D' | 'D-nb' | 'E' | 'E-nb'
  const stage = useRef<Stage>('A')
  const [label, setLabel] = useState<Stage>('A')
  const pick = (s: Stage) => { stage.current = s; setLabel(s); console.log('[gltest] stage', s) }

  const onContext = (gl: any) => {
    const prog = (vs: string, fs: string) => {
      const mk = (t: number, s: string) => {
        const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh)
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh))
        return sh
      }
      const p = gl.createProgram()
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
      return p
    }
    const raw = prog(VS_RAW, FS_RAW)
    const std = prog(VS, FS)
    const buf = gl.createBuffer()
    const dpr = PixelRatio.get()
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight
    const txt = `buf ${W}x${H}  dpr ${dpr}  ver ${gl.getParameter(gl.VERSION)}`
    console.log('[gltest]', txt)
    setInfo(txt)

    // ---- stages D/E use the real classes, created lazily ----
    let backend: GLESBackend | null = null
    let engine: GraphicsRenderer | null = null
    let engineReady = false
    const cssW = W / dpr, cssH = H / dpr
    const realStage = (st: Stage) => {
      if (!backend) backend = new GLESBackend(gl, cssW, cssH, dpr)
      const noBlend = st.endsWith('-nb')
      if (st.startsWith('D')) {
        backend.beginFrame()
        if (noBlend) gl.disable(gl.BLEND); else gl.enable(gl.BLEND)
        const c = backend.ctx
        c.fillStyle = '#1d1d1d'; c.fillRect(0, 0, cssW, cssH)
        c.fillStyle = '#00c800'; c.fillRect(40, 80, 120, 120)
        c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.lineJoin = 'round'; c.lineCap = 'round'
        c.beginPath(); c.moveTo(40, 260); c.lineTo(200, 300); c.lineTo(120, 380); c.stroke()
        c.beginPath(); c.arc(cssW / 2, 500, 60, 0, Math.PI * 2); c.stroke()
        c.fillStyle = '#ff8800'; c.beginPath(); c.roundRect(cssW / 2 - 80, 600, 160, 70, 14); c.fill()
        backend.endFrame()
      } else {
        if (!engine) {
          const r = new GraphicsRenderer(new RenderSurface(backend, cssW, cssH), cssW, cssH)
          engine = r
          r.start().then(() => { engineReady = true }).catch((e) => { console.log('[gltest] engine start failed', String(e)); engineReady = true })
        }
        if (engineReady) {
          engine.markDirty('probe')
          // update() = beginFrame -> draw -> endFrame (inside the engine, exactly as in the editor)
          if (noBlend) gl.disable(gl.BLEND); else gl.enable(gl.BLEND) // must be set BEFORE update() flushes
          engine.update()
        }
      }
    }
    let n = 0
    let lastErr = ''
    const draw = () => {
      try { drawFrame() } catch (e) {
        // an exception used to kill the loop silently, freezing the screen on the previous stage
        const msg = `${stage.current}: ${(e as Error)?.message ?? e}`
        if (msg !== lastErr) { lastErr = msg; console.log('[gltest] ERROR', msg, (e as Error)?.stack); setInfo('ERROR ' + msg) }
      }
      requestAnimationFrame(draw)
    }
    const drawFrame = () => {
      n++
      const st = stage.current
      if (st.startsWith('D') || st.startsWith('E')) { realStage(st); return }
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      if (st === 'A') gl.clearColor(1, 0, 1, 1); else gl.clearColor(0.1, 0.1, 0.1, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (st === 'B') {
        gl.useProgram(raw)
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.8, -0.8, 0.8, -0.8, 0, 0.8]), gl.STATIC_DRAW)
        const loc = gl.getAttribLocation(raw, 'p')
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      if (st === 'C') {
        // identical layout to GLESBackend: x,y,u,v floats + packed RGBA bytes, stride 20
        const f = new Float32Array(12 * 5), u = new Uint32Array(f.buffer)
        const quad = (o: number, x: number, y: number, w: number, h: number, col: number) => {
          const p = [[x, y], [x + w, y], [x + w, y + h], [x, y], [x + w, y + h], [x, y + h]]
          p.forEach((q, i) => { const k = (o + i) * 5; f[k] = q[0]; f[k + 1] = q[1]; f[k + 2] = 0; f[k + 3] = 0; u[k + 4] = col })
        }
        quad(0, 40, 40, 120, 120, 0xff00c800)            // ABGR: opaque green
        quad(6, W / dpr - 48, H / dpr - 48, 48, 48, 0xffffff00) // opaque cyan
        gl.useProgram(std)
        gl.bindBuffer(gl.ARRAY_BUFFER, buf)
        gl.bufferData(gl.ARRAY_BUFFER, f, gl.STREAM_DRAW)
        const pos = gl.getAttribLocation(std, 'a_pos'), col = gl.getAttribLocation(std, 'a_col')
        gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 20, 0)
        gl.enableVertexAttribArray(col); gl.vertexAttribPointer(col, 4, gl.UNSIGNED_BYTE, true, 20, 16)
        gl.uniform2f(gl.getUniformLocation(std, 'u_res'), W / dpr, H / dpr)
        gl.drawArrays(gl.TRIANGLES, 0, 12)
      }
      gl.endFrameEXP()
    }
    draw()
  }

  return (
    <View style= { styles.root } >
    <GLView style={ StyleSheet.absoluteFill } onContextCreate = { onContext } />
      <Text style={ styles.t }> stage { label } { info } </Text>
        < View style = { styles.btns } >
          {(['A', 'B', 'C', 'D', 'D-nb', 'E', 'E-nb'] as Stage[]).map((s) => (
            <Pressable key= { s } onPress = {() => pick(s)} style = { [styles.btn, label === s && styles.btnOn]} >
              <Text style={ styles.bt }> { s } </Text>
                </Pressable>
        ))}
</View>
  </View>
  )
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#333' },
  btns: { position: 'absolute', bottom: 24, left: 8, right: 8, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  btn: { backgroundColor: '#000b', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#888' },
  btnOn: { backgroundColor: '#0a6cff' },
  bt: { color: '#fff', fontSize: 13 },
  t: { position: 'absolute', top: 48, left: 8, right: 8, color: '#fff', fontSize: 12, backgroundColor: '#000a', padding: 4 }
})
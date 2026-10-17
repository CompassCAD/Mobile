import { GLView } from 'expo-gl'
import { useRef, useState } from 'react'
import { PixelRatio, StyleSheet, Text, View } from 'react-native'

/**
 * Standalone GL probe (no engine, no renderer classes). Open with:
 *   adb shell am start -a android.intent.action.VIEW -d "undifer://gltest"
 * Each stage is drawn every frame. Report which of these you can SEE:
 *   A  whole surface magenta           -> GLView presents at all
 *   B  big yellow triangle (clip space) -> raw draw works
 *   C  green square at (40,40) 120x120 CSS px + cyan 48px square bottom-right
 *                                       -> same program/stride/u_res as GLESBackend
 */
const VS = `attribute vec2 a_pos; attribute vec4 a_col; uniform vec2 u_res; varying vec4 v_col;
void main(){ vec2 c=(a_pos/u_res)*2.0-1.0; gl_Position=vec4(c.x,-c.y,0.0,1.0); v_col=a_col; }`
const FS = `precision mediump float; varying vec4 v_col; void main(){ gl_FragColor=v_col; }`
const VS_RAW = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0); }`
const FS_RAW = `precision mediump float; void main(){ gl_FragColor=vec4(1.0,0.9,0.0,1.0); }`

export default function GLTest() {
  const [info, setInfo] = useState('waiting for GL context…')
  const stage = useRef<'A' | 'B' | 'C'>('A')
  const [label, setLabel] = useState('A')

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

    let n = 0
    const draw = () => {
      n++
      const s = Math.floor(n / 180) % 3 // 3s per stage at 60fps
      const st = (['A', 'B', 'C'] as const)[s]
      if (st !== stage.current) { stage.current = st; setLabel(st); console.log('[gltest] stage', st, 'glError', gl.getError()) }
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
      requestAnimationFrame(draw)
    }
    draw()
  }

  return (
    <View style= { styles.root } >
    <GLView style={ StyleSheet.absoluteFill } onContextCreate = { onContext } />
      <Text style={ styles.t }> stage { label } { info } </Text>
        </View>
  )
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#333' },
  t: { position: 'absolute', top: 48, left: 8, right: 8, color: '#fff', fontSize: 12, backgroundColor: '#000a', padding: 4 }
})
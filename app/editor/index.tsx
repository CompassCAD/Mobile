import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { GLView } from 'expo-gl'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BackHandler, Modal, PixelRatio, Platform, Pressable, ScrollView, StatusBar, StyleSheet,
  TextInput, useWindowDimensions, View, GestureResponderEvent
} from 'react-native'
import Canvas from 'react-native-canvas'
import { GraphicsRenderer, InitializeInstance } from './engine/Engine'
import { TouchInput, TouchPoint } from './input/TouchInput'
import { registerTextPrompt } from './platform/TextPrompt'
import { RenderSurface } from './platform/RenderSurface'
import { Canvas2DBackend } from './render/Canvas2DBackend'
import { RenderBackend } from './render/Context2DLike'
import { GLESBackend } from './render/GLESBackend'

const TOPBAR = (StatusBar.currentHeight ?? 24) + 44
const TOOLS: [string, keyof GraphicsRenderer['modes']][] = [
  ['Select', 'Select'], ['Pan', 'Navigate'], ['Move', 'Move'], ['Point', 'AddPoint'], ['Line', 'AddLine'],
  ['Rect', 'AddRectangle'], ['Circle', 'AddCircle'], ['Arc', 'AddArc'], ['Measure', 'AddMeasure'],
  ['Poly', 'AddPolygon'], ['Text', 'AddLabel'], ['Delete', 'Delete']
]

export default function Editor() {
  const router = useRouter()
  // ?backend=canvas2d forces the WebView canvas (debugging / devices without usable GL)
  const params = useLocalSearchParams<{ backend?: string }>()
  const [kind, setKind] = useState<'gles' | 'canvas2d'>(params.backend === 'canvas2d' ? 'canvas2d' : 'gles')
  const { width, height } = useWindowDimensions()
  const viewH = height - TOPBAR - 64
  const renderer = useRef<GraphicsRenderer | null>(null)
  const stopLoop = useRef<(() => void) | null>(null)
  const touch = useRef<TouchInput | null>(null)
  const [fps, setFps] = useState(0)
  const [active, setActive] = useState('Select')
  const [prompt, setPrompt] = useState<{ message: string; resolve: (v: string | null) => void } | null>(null)
  const [promptText, setPromptText] = useState('')

  const boot = useCallback((backend: RenderBackend) => {
    const surface = new RenderSurface(backend, width, viewH)
    const r = new GraphicsRenderer(surface, width, viewH)
    renderer.current = r
    touch.current = new TouchInput(r)
    r.onModeChange = () => {
      const entry = Object.entries(r.modes).find(([, v]) => v === r.mode)
      const label = TOOLS.find(([, m]) => m === entry?.[0])?.[0]
      if (label) setActive(label)
    }
    stopLoop.current = InitializeInstance(r, setFps)
  }, [width, viewH])

  const teardown = useCallback(() => {
    stopLoop.current?.(); stopLoop.current = null
    touch.current?.dispose(); touch.current = null
    renderer.current?.dispose(); renderer.current = null
  }, [])

  useEffect(() => {
    registerTextPrompt((message, resolve) => { setPromptText(''); setPrompt({ message, resolve }) })
    return () => { registerTextPrompt(null); teardown() }
  }, [teardown])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { teardown(); router.back(); return true })
    return () => sub.remove()
  }, [router, teardown])

  const onGLContext = useCallback((gl: any) => {
    try {
      boot(new GLESBackend(gl, width, viewH, PixelRatio.get()))
    } catch (e) {
      console.warn('[editor] GLES backend failed, falling back to Canvas2D:', (e as Error).message)
      teardown(); setKind('canvas2d')
    }
  }, [boot, width, viewH, teardown])

  const canvasRef = useCallback((c: Canvas | null) => {
    if (!c || renderer.current) return
    c.width = width; c.height = viewH
    boot(new Canvas2DBackend(c, width, viewH))
  }, [boot, width, viewH])

  const pts = (e: GestureResponderEvent): TouchPoint[] =>
    e.nativeEvent.touches.map((t) => ({ x: t.locationX, y: t.locationY }))
  const setMode = (label: string, mode: keyof GraphicsRenderer['modes']) => {
    const r = renderer.current
    if (!r) return
    r.setMode(r.modes[mode]); setActive(label); r.markDirty('toolbar')
  }

  return (
    <View style={styles.root}>
      <View style={styles.topbar}>
        <ThemedText type="default" onPress={() => { teardown(); router.back() }}>go back</ThemedText>
        <ThemedText type="default" style={styles.fps}>{kind === 'gles' ? 'GLES' : 'Canvas2D'} · {fps} fps</ThemedText>
      </View>
      <View style={{ width, height: viewH }}>
        {kind === 'gles'
          ? <GLView key="gl" style={StyleSheet.absoluteFill} onContextCreate={onGLContext} />
          : <Canvas key="c2d" ref={canvasRef} style={StyleSheet.absoluteFill} />}
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(e) => touch.current?.start(pts(e))}
          onResponderMove={(e) => touch.current?.move(pts(e))}
          onResponderRelease={(e) => touch.current?.end(e.nativeEvent.changedTouches[0] ? { x: e.nativeEvent.changedTouches[0].locationX, y: e.nativeEvent.changedTouches[0].locationY } : null, e.nativeEvent.touches.length)}
          onResponderTerminate={() => touch.current?.end(null, 0)}
        />
      </View>
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
          <Pressable style={styles.tool} onPress={() => renderer.current?.undo()}><ThemedText type="default">Undo</ThemedText></Pressable>
          <Pressable style={styles.tool} onPress={() => renderer.current?.redo()}><ThemedText type="default">Redo</ThemedText></Pressable>
          {TOOLS.map(([label, mode]) => (
            <Pressable key={label} style={[styles.tool, active === label && styles.toolActive]} onPress={() => setMode(label, mode)}>
              <ThemedText type="default">{label}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={() => { prompt?.resolve(null); setPrompt(null) }}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <ThemedText type="default">{prompt?.message}</ThemedText>
            <TextInput autoFocus value={promptText} onChangeText={setPromptText} style={styles.input} placeholderTextColor="#888" />
            <View style={styles.modalRow}>
              <Pressable onPress={() => { prompt?.resolve(null); setPrompt(null) }}><ThemedText type="default">Cancel</ThemedText></Pressable>
              <Pressable onPress={() => { prompt?.resolve(promptText); setPrompt(null) }}><ThemedText type="default">OK</ThemedText></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1d1d1d' },
  topbar: {
    backgroundColor: Colors.dark.background, paddingTop: StatusBar.currentHeight, height: TOPBAR,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20,
    borderBottomColor: Colors.dark.border, borderBottomWidth: 0.75
  },
  fps: { opacity: 0.6 },
  toolbar: { height: 64, backgroundColor: Colors.dark.background, borderTopColor: Colors.dark.border, borderTopWidth: 0.75, justifyContent: 'center' },
  toolRow: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  tool: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 0.75, borderColor: Colors.dark.border },
  toolActive: { backgroundColor: '#0080ff55', borderColor: '#0080ff' },
  modalBg: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: Colors.dark.background, borderRadius: 12, padding: 16, gap: 12 },
  input: { borderWidth: 0.75, borderColor: Colors.dark.border, borderRadius: 8, color: '#fff', padding: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 }
})

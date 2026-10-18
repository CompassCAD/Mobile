import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { GLView } from 'expo-gl'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  BackHandler, Modal, PixelRatio, Platform, Pressable, ScrollView, StatusBar, StyleSheet,
  TextInput, useWindowDimensions, View, GestureResponderEvent
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Canvas from 'react-native-canvas'
import { GraphicsRenderer, InitializeInstance } from './engine/Engine'
import { TouchInput, TouchPoint } from './input/TouchInput'
import { registerTextPrompt } from './platform/TextPrompt'
import { RenderSurface } from './platform/RenderSurface'
import { Canvas2DBackend } from './render/Canvas2DBackend'
import { RenderBackend } from './render/Context2DLike'
import { GLESBackend } from './render/GLESBackend'
import { SvgProps } from 'react-native-svg';

// Misc icons
import SelectIcon from '../../assets/icons/navigate.svg'
import NavigateIcon from '../../assets/icons/pan.svg'
import MoveIcon from '../../assets/icons/move.svg'
import DeleteIcon from '../../assets/icons/delete.svg'

import AddPointIcon from '../../assets/icons/point.svg'
import AddLineIcon from '../../assets/icons/line.svg'
import AddCircleIcon from '../../assets/icons/circle.svg'
import AddArcIcon from '../../assets/icons/arc.svg'
import AddRectangleIcon from '../../assets/icons/rectangle.svg'
import AddPictureIcon from '../../assets/icons/image.svg'
import AddPolygonIcon from '../../assets/icons/polygon.svg'
import AddBoundBoxIcon from '../../assets/icons/boundbox.svg'
import AddTextIcon from '../../assets/icons/text.svg'
import MeasureIcon from '../../assets/icons/measure.svg'

interface ToolEntry {
  icon: FC<SvgProps> | string
  key: keyof GraphicsRenderer['modes']
}

const TOPBAR = (StatusBar.currentHeight ?? 24) + 44
const TOOLBAR_HEIGHT = 64
const TOOLBAR_MARGIN = 12

const TOOLS: ToolEntry[] = [
  { icon: SelectIcon, key: 'Select' },
  { icon: NavigateIcon, key: 'Navigate' },
  { icon: MoveIcon, key: 'Move' },
  { icon: DeleteIcon, key: 'Delete' },
  { icon: AddPointIcon, key: 'AddPoint' },
  { icon: AddLineIcon, key: 'AddLine' },
  { icon: AddCircleIcon, key: 'AddCircle' },
  { icon: AddArcIcon, key: 'AddArc' },
  { icon: AddRectangleIcon, key: 'AddRectangle' },
  { icon: AddPictureIcon, key: 'AddPicture' },
  { icon: AddPolygonIcon, key: 'AddPolygon' },
  { icon: AddBoundBoxIcon, key: 'AddBoundbox' },
  { icon: AddTextIcon, key: 'AddLabel' },
  { icon: MeasureIcon, key: 'Measure' }
]
export default function Editor() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // ?backend=canvas2d forces the WebView canvas (debugging / devices without usable GL)
  const params = useLocalSearchParams<{ backend?: string }>()
  const [kind, setKind] = useState<'gles' | 'canvas2d'>(params.backend === 'canvas2d' ? 'canvas2d' : 'gles')
  const { width, height } = useWindowDimensions()
  // Canvas fills the whole screen; the top bar and toolbar float over it.
  const viewH = height
  const renderer = useRef<GraphicsRenderer | null>(null)
  const stopLoop = useRef<(() => void) | null>(null)
  const touch = useRef<TouchInput | null>(null)
  const [fps, setFps] = useState(0)
  const [active, setActive] = useState<keyof GraphicsRenderer['modes']>('Select')
  const [prompt, setPrompt] = useState<{ message: string; resolve: (v: string | null) => void } | null>(null)
  const [promptText, setPromptText] = useState('')

  const boot = useCallback((backend: RenderBackend) => {
    console.log('[editor] booting with backend', backend.constructor.name)
    const surface = new RenderSurface(backend, width, viewH)
    const r = new GraphicsRenderer(surface, width, viewH)
    renderer.current = r
    touch.current = new TouchInput(r)
    r.onModeChange = () => {
      const key = (Object.keys(r.modes) as (keyof GraphicsRenderer['modes'])[])
        .find((k) => r.modes[k] === r.mode)
      if (key) setActive(key)
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
    const setMode = (key: keyof GraphicsRenderer['modes']) => {
      console.log('[editor] setMode', key)
      const r = renderer.current
      if (!r) return
      r.setMode(r.modes[key]); setActive(key); r.markDirty('toolbar')
    }

  return (
    <View style={styles.root}>
      <View style={[StyleSheet.absoluteFill]}>
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

      <View style={styles.topbar}>
        <ThemedText type="default" onPress={() => { teardown(); router.back() }}>go back</ThemedText>
        <ThemedText type="default" style={styles.fps}>{kind === 'gles' ? 'GLES' : 'Canvas2D'} · {fps} fps</ThemedText>
      </View>

      <View
        style={[styles.toolbar, { bottom: TOOLBAR_MARGIN + insets.bottom }]}
        onStartShouldSetResponder={() => true}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolRow}>
          {TOOLS.map((tool) => {
            const isActive = active === tool.key
            const color = isActive ? '#0080ff' : Colors.dark.text
            return (
              <Pressable
                key={tool.key}
                accessibilityLabel={tool.key}
                style={[styles.tool, isActive && styles.toolActive]}
                onPress={() => setMode(tool.key)}
              >
                {typeof tool.icon === 'string'
                  ? <ThemedText type="default">{tool.icon}</ThemedText>
                  : <tool.icon width={28} height={28} color={color} />}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={() => { prompt?.resolve(null); setPrompt(null) }}>
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <ThemedText type="h2">{prompt?.message}</ThemedText>
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
    backgroundColor: Colors.dark.background,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: StatusBar.currentHeight,
    height: TOPBAR,
    zIndex: 3,
    elevation: 6,
    display: 'flex',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderBottomColor: Colors.dark.border,
    borderBottomWidth: 0.75,
    boxShadow: '0px 0px 13px 3px rgba(0, 0, 0, 0.5)'
  },
  fps: { opacity: 0.6 },
  toolbar: {
    position: 'absolute',
    left: TOOLBAR_MARGIN,
    right: TOOLBAR_MARGIN,
    height: TOOLBAR_HEIGHT,
    zIndex: 3,
    elevation: 6,
    borderRadius: 18,
    backgroundColor: Colors.dark.background,
    borderColor: Colors.dark.border,
    borderWidth: 0.75,
    justifyContent: 'center',
    boxShadow: '0px 0px 13px 3px rgba(0, 0, 0, 0.5)'
  },
  toolRow: { paddingHorizontal: 8, gap: 6, alignItems: 'center' },
  tool: { padding: 8, borderRadius: 10 },
  toolActive: { backgroundColor: '#00a3ff' },
  modalBg: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: Colors.dark.background, borderRadius: 12, padding: 16, gap: 12 },
  input: { borderWidth: 0.75, borderColor: Colors.dark.border, borderRadius: 8, color: '#fff', padding: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 }
})
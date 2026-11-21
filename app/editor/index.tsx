import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { GLView } from 'expo-gl'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FC, useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, BackHandler, Keyboard, Modal, PixelRatio, Platform, Pressable, ScrollView, StyleSheet,
  TextInput, useWindowDimensions, View, GestureResponderEvent
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Canvas from 'react-native-canvas'
import { GraphicsRenderer, InitializeInstance } from './engine/Engine'
import { TouchInput, TouchPoint } from './input/TouchInput'
import { drawingSession } from '@/components/DrawingSession'
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

import Animated from 'react-native-reanimated'
import { menuEntrance } from '@/components/menuEntrance'
import { saveDesign, saveDrawingPreview } from '@/components/DrawingFiles'
import MenuIcon from '../../assets/icons/menu.svg'
import UndoIcon from '../../assets/icons/undo.svg'
import RedoIcon from '../../assets/icons/redo.svg'
import SaveIcon from '../../assets/icons/saveLogic.svg'
import BackIcon from '../../assets/icons/back.svg'

interface ToolEntry {
  icon: FC<SvgProps> | string
  key: keyof GraphicsRenderer['modes']
}

const HEADER_HEIGHT = 56
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
  { icon: MeasureIcon, key: 'AddMeasure' }
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [title, setTitle] = useState(drawingSession.title)
  const [ready, setReady] = useState(false)
  const saving = useRef(false)
  const snapshot = useRef<(() => Promise<string>) | null>(null)
  const [savingDesign, setSavingDesign] = useState(false)
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
    drawingSession.restore(r)
    setReady(true)
  }, [width, viewH])

  const teardown = useCallback(() => {
    snapshot.current = null
    stopLoop.current?.(); stopLoop.current = null
    touch.current?.dispose(); touch.current = null
    if (renderer.current) {
      drawingSession.capture(renderer.current)
      renderer.current.dispose()
      renderer.current = null
    }
  }, [])

  useEffect(() => {
    registerTextPrompt((message, resolve) => { setPromptText(''); setPrompt({ message, resolve }) })
    return () => { registerTextPrompt(null); teardown() }
  }, [teardown])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) setMenuOpen(false)
      else { teardown(); router.back() }
      return true
    })
    return () => sub.remove()
  }, [menuOpen, router, teardown])

  const onGLContext = useCallback((gl: any) => {
    try {
      const backend = new GLESBackend(gl, width, viewH, PixelRatio.get())
      boot(backend)
      const r = renderer.current!
      snapshot.current = () => backend.captureCover(() => {
        r.markDirty('capture cover')
        r.update()
      })
    } catch (e) {
      console.warn('[editor] GLES backend failed, falling back to Canvas2D:', (e as Error).message)
      teardown(); setKind('canvas2d')
    }
  }, [boot, width, viewH, teardown])

  const canvasRef = useCallback((c: Canvas | null) => {
    if (!c || renderer.current) return
    c.width = width; c.height = viewH
    boot(new Canvas2DBackend(c, width, viewH))
    snapshot.current = async () => {
      renderer.current?.markDirty('capture cover')
      renderer.current?.update()
      return (await c.toDataURL('image/jpeg', 0.8)).replace(/^"|"$/g, '')
    }
  }, [boot, width, viewH])

  async function saveCurrentDesign() {
    const r = renderer.current
    if (!r?.logicDisplay || saving.current) return
    saving.current = true
    setSavingDesign(true)
    setMenuOpen(false)
    try {
      drawingSession.capture(r)
      const source = drawingSession.source!
      const identity = drawingSession.identity
      const cover = (snapshot.current ? snapshot.current() : Promise.reject(new Error('Renderer unavailable')))
        .then(uri => ({ uri }), error => ({ error }))
      const file = await saveDesign(source, drawingSession.title, drawingSession.destination)
      if (drawingSession.identity === identity) drawingSession.markSaved(file.name, source, file.uri)
      try {
        const result = await cover
        if ('error' in result) throw result.error
        await saveDrawingPreview(file.uri, result.uri)
      } catch (error) {
        if (renderer.current === r) Alert.alert('Design saved without a new cover', String(error))
        return
      }
      if (renderer.current === r) Alert.alert('Design saved', file.name)
    } catch (error) {
      if (!/cancel(?:led|ed)/i.test(String(error))) Alert.alert('Could not save design', String(error))
    } finally {
      saving.current = false
      setSavingDesign(false)
    }
  }

  function historyAction(action: 'undo' | 'redo') {
    const r = renderer.current
    if (!r) return
    r.setMode(r.modes.Select)
    r[action]()
    setMenuOpen(false)
  }

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

      <View style={[styles.topbar, { height: insets.top + HEADER_HEIGHT, paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { teardown(); router.back() }} style={styles.topbarButton}>
          <BackIcon width={28} height={28} />
        </Pressable>
        <TextInput accessibilityLabel="Design name" editable={ready} value={title} selectTextOnFocus
          returnKeyType="done" maxLength={10000} style={styles.title}
          onChangeText={value => {
            setTitle(value)
            if (renderer.current) drawingSession.rename(renderer.current, value)
          }}
          onBlur={() => setTitle(drawingSession.title)}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Design menu" accessibilityState={{ expanded: menuOpen }}
          style={styles.topbarButton} onPress={() => { Keyboard.dismiss(); setMenuOpen(!menuOpen) }}>
          <MenuIcon width={28} height={28} />
        </Pressable>
      </View>

      {menuOpen && (
        <View style={[styles.menuOverlay, { top: insets.top + HEADER_HEIGHT }]} accessibilityViewIsModal>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close design menu" onPress={() => setMenuOpen(false)} />
          <Animated.View style={styles.menu} entering={menuEntrance}>
            {[
              { label: 'Undo', Icon: UndoIcon, disabled: (renderer.current?.undoStack.length ?? 0) < 2, press: () => historyAction('undo') },
              { label: 'Redo', Icon: RedoIcon, disabled: !renderer.current?.redoStack.length, press: () => historyAction('redo') },
              { label: 'Save Design', Icon: SaveIcon, disabled: !ready || savingDesign, press: saveCurrentDesign }
            ].map(({ label, Icon, disabled, press }) => (
              <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={press}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed, disabled && styles.menuDisabled]}>
                <Icon width={24} height={24} />
                <ThemedText>{label}</ThemedText>
              </Pressable>
            ))}
          </Animated.View>
        </View>
      )}

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
    zIndex: 3,
    elevation: 6,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomColor: Colors.dark.border,
    borderBottomWidth: 0.75,
    boxShadow: '0px 0px 13px 3px rgba(0, 0, 0, 0.5)',
  },
  topbarButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, paddingVertical: 0, textAlign: 'center', color: Colors.dark.text, fontFamily: 'RadioCanadaBig-Bold', fontSize: 18 },
  menuOverlay: { ...StyleSheet.absoluteFill, zIndex: 4, elevation: 8 },
  menu: { position: 'absolute', right: 12, top: 12, padding: 6, backgroundColor: Colors.dark.background,
    borderColor: Colors.dark.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, boxShadow: '0 4px 14px #0006' },
  menuItem: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12 },
  menuPressed: { backgroundColor: '#343434' },
  menuDisabled: { opacity: 0.45 },
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
  toolActive: { backgroundColor: '#0080ff' },
  modalBg: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: Colors.dark.background, borderRadius: 12, padding: 16, gap: 12 },
  input: { borderWidth: 0.75, borderColor: Colors.dark.border, borderRadius: 8, color: '#fff', padding: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 }
})
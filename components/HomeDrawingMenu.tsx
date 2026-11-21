import MenuIcon from '../assets/icons/menu.svg'
import { confirmDrawingReplacement } from './confirmDrawingReplacement'
import NewIcon from '../assets/icons/newLogic.svg'
import OpenIcon from '../assets/icons/openLogic.svg'
import SaveAsIcon from '../assets/icons/saveas.svg'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Alert, BackHandler, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { menuEntrance } from './menuEntrance'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { pickDrawing, saveDrawingCopy } from './DrawingFiles'
import { Colors } from '../constants/theme'
import { drawingSession } from './DrawingSession'
import { ThemedText } from './themed-text'

export function HomeDrawingMenu() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [panel, setPanel] = useState<'closed' | 'menu' | 'name'>('closed')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const focused = useRef(false)

  useFocusEffect(useCallback(() => {
    focused.current = true
    return () => { focused.current = false; setPanel('closed') }
  }, []))

  useFocusEffect(useCallback(() => {
    if (panel === 'closed') return
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      setPanel('closed')
      return true
    })
    return () => listener.remove()
  }, [panel]))

  async function run(action: 'new' | 'open' | 'save') {
    if (pending.current) return
    const base = name.trim().replace(/\.cnext$/i, '')
    if (action === 'save' && (!base || /[\\/:*?"<>|]/.test(base))) {
      Alert.alert('Enter a valid file name')
      return
    }
    pending.current = true
    setBusy(true)
    setPanel('closed')
    Keyboard.dismiss()
    try {
      if (action === 'new') {
        if (!await confirmDrawingReplacement() || !focused.current) return
        drawingSession.newDesign()
        router.push('/editor')
      } else if (action === 'open') {
        const file = await pickDrawing()
        if (!file || !focused.current) return
        if (!await confirmDrawingReplacement() || !focused.current) return
        drawingSession.open(file.name, file.source)
        router.push('/editor')
      } else {
        const source = drawingSession.source
        if (source === null) return
        const written = await saveDrawingCopy(source, base + '.cnext')
        drawingSession.markSaved(written.name, source)
      }
    } catch (error) {
      if (focused.current && !/cancel(?:led|ed)/i.test(String(error)))
        Alert.alert(action === 'open' ? 'Could not open drawing' : 'Could not save drawing', String(error))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <>
      {panel !== 'closed' && (
        <View style={[styles.overlay, panel === 'name' && styles.scrim]} accessibilityViewIsModal>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss drawing menu"
            onPress={() => setPanel('closed')} />
          {panel === 'menu' ? (
            <Animated.View entering={menuEntrance} style={styles.actions}>
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={() => run('new')}>
                <NewIcon width={28} height={28} />
                <ThemedText style={styles.label}>New Design</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={() => run('open')}>
                <OpenIcon width={28} height={28} />
                <ThemedText type="default" style={styles.label}>Open drawing</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={drawingSession.source === null}
                accessibilityState={{ disabled: drawingSession.source === null }}
                style={({ pressed }) => [styles.action, pressed && styles.pressed, drawingSession.source === null && styles.disabled]}
                onPress={() => {
                  setName(drawingSession.name.replace(/\.cnext$/i, ''))
                  setPanel('name')
                }}>
                <SaveAsIcon width={28} height={28} />
                <ThemedText type="default" style={styles.label}>Save As</ThemedText>
              </Pressable>
            </Animated.View>
          ) : (
            <View style={[styles.prompt, { top: insets.top + 24 }]}>
              <ThemedText type="defaultBold">Save drawing as</ThemedText>
              <TextInput accessibilityLabel="File name" autoFocus selectTextOnFocus value={name}
                onChangeText={setName} onSubmitEditing={() => run('save')} style={styles.input} />
              <View style={styles.row}>
                <Pressable onPress={() => setPanel('closed')}><ThemedText>Cancel</ThemedText></Pressable>
                <Pressable onPress={() => run('save')}><ThemedText>Choose folder</ThemedText></Pressable>
              </View>
            </View>
          )}
        </View>
      )}
      {panel !== 'name' && (
        <Pressable accessibilityRole="button" accessibilityLabel="Drawing menu" disabled={busy}
          accessibilityState={{ expanded: panel === 'menu', disabled: busy }}
          style={styles.toggle}
          onPress={() => setPanel(panel === 'closed' ? 'menu' : 'closed')}>
          <MenuIcon width={32} height={32} />
        </Pressable>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  toggle: {
    position: 'absolute', right: 18, bottom: 18, width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#0080ff', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 14px #0006'
  },
  overlay: { ...StyleSheet.absoluteFill },
  scrim: { backgroundColor: '#0008' },
  actions: {
    position: 'absolute', right: 18, bottom: 100, width: 224, maxWidth: '90%',
    padding: 8, borderRadius: 20, backgroundColor: '#1F1F1F',
    borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.dark.border,
    boxShadow: '0 5px 22px #0009'
  },
  action: {
    flexDirection: 'row', alignItems: 'center', minHeight: 48,
    paddingHorizontal: 12, paddingVertical: 8, gap: 10, borderRadius: 12
  },
  pressed: { backgroundColor: '#343434' },
  label: { color: Colors.dark.text, flexShrink: 1, fontSize: 17 },
  disabled: { opacity: 0.45 },
  prompt: {
    position: 'absolute', left: 20, right: 20, borderRadius: 16, padding: 20, gap: 12,
    backgroundColor: Colors.dark.background, borderColor: Colors.dark.border, borderWidth: 1
  },
  input: { color: Colors.dark.text, padding: 10, borderWidth: 1, borderColor: Colors.dark.border, borderRadius: 8 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24 }
})

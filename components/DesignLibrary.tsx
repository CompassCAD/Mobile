import { File } from 'expo-file-system'
import { Link, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { HomeDrawingMenu } from '@/components/HomeDrawingMenu'
import { recentDesigns, subscribeRecentDesigns, type RecentDesign } from '@/components/DrawingFiles'
import { drawingSession } from '@/components/DrawingSession'
import { confirmDrawingReplacement } from '@/components/confirmDrawingReplacement'
import { ThemedText } from '@/components/themed-text'
import { SafeView } from '@/components/SafeView'

export function DesignLibrary({ recent }: { recent: boolean }) {
  const router = useRouter()
  const [designs, setDesigns] = useState<RecentDesign[]>([])
  const opening = useRef(false)

  useFocusEffect(useCallback(() => {
    let revision = 0
    function refresh() {
      const request = ++revision
      recentDesigns(recent ? 5 : undefined).then(items => { if (request === revision) setDesigns(items) })
        .catch(error => { if (request === revision) Alert.alert('Could not load recent designs', String(error)) })
    }
    const unsubscribe = subscribeRecentDesigns(refresh)
    refresh()
    return () => { revision++; unsubscribe() }
  }, [recent]))

  async function openRecent(item: RecentDesign) {
    if (opening.current) return
    opening.current = true
    try {
      if (drawingSession.destination !== item.uri) {
        if (!await confirmDrawingReplacement()) return
        const file = new File(item.uri)
        drawingSession.open(file.name, await file.text(), item.uri)
      }
      router.push('/editor')
    } catch (error) {
      Alert.alert('Could not open drawing', String(error))
    } finally {
      opening.current = false
    }
  }

  return (
    <SafeView style={styles.home} edges={['top', 'left', 'right']}>
      <FlatList data={designs} keyExtractor={item => item.uri} contentContainerStyle={styles.list}
        ListHeaderComponent={<View style={styles.header}>
          <ThemedText type="title">{recent ? 'a' : 'Designs'}</ThemedText>
        </View>}
        ListEmptyComponent={<ThemedText>Your saved designs will appear here.</ThemedText>}
        ListFooterComponent={recent && __DEV__ ? <Link href="/gltest">GL tests</Link> : undefined}
        renderItem={({ item }) => (
          <Pressable style={styles.card} accessibilityRole="button" onPress={() => openRecent(item)}>
            {item.preview && <Image key={item.preview + item.previewModified} source={{ uri: item.preview }} cachePolicy="none" recyclingKey={item.preview + item.previewModified} contentFit="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />}
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs><LinearGradient id="shade" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="40%" stopColor="#090909" stopOpacity={0} />
                <Stop offset="100%" stopColor="#090909" stopOpacity={1} />
              </LinearGradient></Defs>
              <Rect width="100%" height="100%" fill="url(#shade)" />
            </Svg>
            <ThemedText type="defaultBold" numberOfLines={1} style={styles.title}>{item.title}</ThemedText>
            <ThemedText style={styles.date}>Last Edited · {new Date(item.modified).toLocaleString()}</ThemedText>
          </Pressable>
        )} />
      {recent && <HomeDrawingMenu />}
    </SafeView>
  )
}

const styles = StyleSheet.create({
  home: { flex: 1, backgroundColor: '#1F1F1F' },
  list: { padding: 16, gap: 16, paddingBottom: 105 },
  header: { gap: 8 },
  card: { aspectRatio: 1.85, backgroundColor: '#202020', justifyContent: 'flex-end', padding: 16,
    borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#636363' },
  title: { color: '#fff', fontSize: 18 },
  date: { color: '#bdbdbd', fontSize: 13 }
})

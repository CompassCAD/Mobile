import { Alert } from 'react-native'
import { drawingSession } from './DrawingSession'

export function confirmDrawingReplacement(): Promise<boolean> {
  if (!drawingSession.dirty) return Promise.resolve(true)
  return new Promise(resolve => Alert.alert(
    'Leave this drawing?', 'Changes since the last save will be lost.',
    [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', style: 'destructive', onPress: () => resolve(true) }]
  ))
}

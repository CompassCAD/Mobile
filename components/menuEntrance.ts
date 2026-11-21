import { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated'

export const menuEntrance = FadeInDown
  .withInitialValues({ opacity: 0, transform: [{ translateY: 2.5 }] })
  .duration(160)
  .easing(Easing.inOut(Easing.quad))
  .reduceMotion(ReduceMotion.System)


import { SafeView } from '@/components/SafeView';
import { ThemedText } from '@/components/themed-text';
import { Link } from 'expo-router';
import { useState } from 'react';

export default function HomeScreen() {
  const [date, setDate] = useState<Date>(new Date());
  const [period, setPeriod] = useState<number>(0);
  const msg = [
    'morning',
    'afternoon',
    'evening',
    'night'
  ]
  const emojis = [
    '☀️',
    '🌤️',
    '🌆',
    '🌙'
  ]
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) {
    period !== 0 && setPeriod(0);
  } else if (hour >= 12 && hour < 17) {
    period !== 1 && setPeriod(1);
  } else if (hour >= 17 && hour < 21) {
    period !== 2 && setPeriod(2);
  } else {
    period !== 3 && setPeriod(3);
  }
  return (
    <SafeView style={{padding: 20}}>
      <ThemedText type='h2'>Good {msg[period]}! {emojis[period]}</ThemedText>
      <ThemedText type='default'><Link href='/editor'>Let's get you there!</Link></ThemedText>
    </SafeView>
  );
}

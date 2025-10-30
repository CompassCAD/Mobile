import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import 'react-native-reanimated';

import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [fontLoaded, error] = useFonts({
    'RadioCanadaBig': require('../assets/fonts/RadioCanadaBig-Regular.ttf'),
    'RadioCanadaBig-Medium': require('../assets/fonts/RadioCanadaBig-Medium.ttf'),
    'RadioCanadaBig-Semibold': require('../assets/fonts/RadioCanadaBig-SemiBold.ttf'),
    'RadioCanadaBig-Bold': require('../assets/fonts/RadioCanadaBig-Bold.ttf')
  })

  useEffect(() => {
    if (error) throw error;
  }, [error])

  useEffect(() => {
    if (fontLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontLoaded])

  if (!fontLoaded) {
    return null;
  }
  return <RootLayoutNav />
}
function RootLayoutNav() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    if (Platform.OS === 'android') {
      SystemUI.setBackgroundColorAsync('#1d1d1d');
      NavigationBar.setPositionAsync("absolute");
      NavigationBar.setBackgroundColorAsync("transparent");
      NavigationBar.setButtonStyleAsync('light'); 
    }
  }, []);
  return (
    <ThemeProvider value={DarkTheme}>
      <Stack 

      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#1d1d1d' },
      }}
      >
      <Stack.Screen 
        name="(tabs)" 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="editor" 
        options={{ 
        presentation: 'modal', 
        title: 'Modal',
        }} 
      />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

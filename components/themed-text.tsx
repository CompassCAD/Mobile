import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'h2';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        type === 'h2' ? styles.h2 : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'RadioCanadaBig'
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'RadioCanadaBig-Semibold'
  },
  title: {
    fontSize: 32,
    fontFamily: 'RadioCanadaBig-Bold',
  },
  h2: {
    fontSize: 24,
    fontFamily: 'RadioCanadaBig-Bold',
  },
  subtitle: {
    fontSize: 20,
    fontFamily: 'RadioCanadaBig'
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
    fontFamily: 'RadioCanadaBig'
  },
});

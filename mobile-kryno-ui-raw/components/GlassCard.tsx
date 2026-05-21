import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS } from '../lib/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  glow?: boolean;
  glowColor?: string;
  radius?: number;
  gradient?: string[];
}

export default function GlassCard({ children, style, glow, glowColor = COLORS.primary, radius = RADIUS.lg, gradient }: Props) {
  const glowStyle = glow ? {
    shadowColor: glowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 10,
  } : {};

  if (gradient) {
    return (
      <LinearGradient
        colors={gradient as any}
        style={[styles.card, { borderRadius: radius }, glowStyle, style]}
      >
        {children}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.card, { borderRadius: radius }, glowStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
});

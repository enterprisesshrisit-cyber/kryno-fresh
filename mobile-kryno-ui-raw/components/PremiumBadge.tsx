import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, RADIUS, TIER } from '../lib/theme';
import type { TierType } from '../lib/theme';

export default function PremiumBadge({ tier }: { tier: TierType }) {
  const cfg = TIER[tier];
  return (
    <LinearGradient colors={cfg.colors as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badge}>
      <Text style={styles.icon}>{cfg.icon}</Text>
      <Text style={styles.text}>{tier}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  icon: { fontSize: 10, color: COLORS.white },
  text: { fontSize: FONTS.xs, fontWeight: FONTS.bold, color: COLORS.white, letterSpacing: 0.6, textTransform: 'uppercase' },
});

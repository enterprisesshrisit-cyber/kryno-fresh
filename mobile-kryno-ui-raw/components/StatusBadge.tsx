import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../lib/theme';

type Status = 'active' | 'focus' | 'private';

const STATUS_CONFIG: Record<Status, { label: string; icon: string; color: string; bg: string }> = {
  active: { label: 'Active Now', icon: '🔥', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  focus: { label: 'Focus Mode', icon: '🧠', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
  private: { label: 'Private Mode', icon: '🌙', color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
};

interface Props {
  status: Status;
  onPress?: () => void;
}

export default function StatusBadge({ status, onPress }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.badge, { backgroundColor: config.bg, borderColor: config.color + '40' }]}
      activeOpacity={0.75}
    >
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  icon: { fontSize: 13 },
  label: {
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.semibold,
    letterSpacing: 0.2,
  },
});

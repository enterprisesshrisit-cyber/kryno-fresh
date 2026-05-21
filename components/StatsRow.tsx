import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, FONTS, SPACING } from '../lib/theme';

interface Stat {
  label: string;
  value: number;
  suffix?: string;
}

function AnimatedStat({ label, value, suffix = '' }: Stat) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const steps = 40;
    const increment = value / steps;
    const interval = setInterval(() => {
      start += increment;
      if (start >= value) {
        setDisplayed(value);
        clearInterval(interval);
      } else {
        setDisplayed(Math.floor(start));
      }
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);

  const formatNum = (n: number) => {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  };

  return (
    <TouchableOpacity style={styles.stat} activeOpacity={0.75}>
      <Text style={styles.value}>{formatNum(displayed)}{suffix}</Text>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

interface Props {
  posts: number;
  followers: number;
  following: number;
  visits: number;
}

export default function StatsRow({ posts, followers, following, visits }: Props) {
  return (
    <View style={styles.container}>
      <AnimatedStat label="Posts" value={posts} />
      <View style={styles.divider} />
      <AnimatedStat label="Followers" value={followers} />
      <View style={styles.divider} />
      <AnimatedStat label="Following" value={following} />
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.value}>👀 {visits}</Text>
        <Text style={styles.label}>Today</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 4,
  },
  value: {
    fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

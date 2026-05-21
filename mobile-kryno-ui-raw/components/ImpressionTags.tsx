import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, RADIUS, SPACING } from '../lib/theme';

interface Tag {
  label: string;
  icon: string;
}

interface Props {
  tags: Tag[];
}

function TagPill({ tag, delay }: { tag: Tag; delay: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <LinearGradient
        colors={['rgba(99,102,241,0.2)', 'rgba(139,92,246,0.12)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.pill}
      >
        <Text style={styles.icon}>{tag.icon}</Text>
        <Text style={styles.label}>{tag.label}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

export default function ImpressionTags({ tags }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>First Impression</Text>
      <View style={styles.row}>
        {tags.map((tag, i) => (
          <TagPill key={tag.label} tag={tag} delay={i * 120} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  header: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: FONTS.weights.semibold,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    gap: 5,
  },
  icon: { fontSize: 13 },
  label: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    fontWeight: FONTS.weights.medium,
  },
});

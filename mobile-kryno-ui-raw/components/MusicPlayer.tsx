import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACING } from '../lib/theme';

interface Props {
  title: string;
  artist: string;
  duration: string;
  progress: number;
}

export default function MusicPlayer({ title, artist, duration, progress: initialProgress }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(initialProgress);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!playing) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [playing]);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [expanded]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 0.002, 1));
    }, 200);
    return () => clearInterval(interval);
  }, [playing]);

  const barWidth = expandAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const getTimeFromProgress = (p: number) => {
    const total = 243;
    const secs = Math.floor(p * total);
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => setExpanded(!expanded)}>
      <LinearGradient
        colors={['rgba(99,102,241,0.18)', 'rgba(139,92,246,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.row}>
          <Animated.View style={[styles.albumArt, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient
              colors={['#6366F1', '#EC4899']}
              style={styles.albumGradient}
            >
              <Ionicons name="musical-notes" size={18} color="white" />
            </LinearGradient>
          </Animated.View>

          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.artist}>{artist}</Text>
          </View>

          <View style={styles.controls}>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); setPlaying(!playing); }}
              style={styles.playBtn}
            >
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                style={styles.playGradient}
              >
                <Ionicons name={playing ? 'pause' : 'play'} size={16} color="white" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>

        {expanded && (
          <View style={styles.expandedRow}>
            <Text style={styles.timeText}>{getTimeFromProgress(progress)}</Text>
            <View style={styles.extraControls}>
              <TouchableOpacity style={styles.extraBtn}>
                <Ionicons name="shuffle" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.extraBtn}>
                <Ionicons name="repeat" size={14} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.extraBtn}>
                <Ionicons name="heart" size={14} color={COLORS.pink} />
              </TouchableOpacity>
            </View>
            <Text style={styles.timeText}>{duration}</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  albumArt: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
  },
  albumGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  title: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  artist: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  controls: {},
  playBtn: { borderRadius: 20, overflow: 'hidden' },
  playGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  timeText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    fontVariant: ['tabular-nums'],
  },
  extraControls: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  extraBtn: { padding: 4 },
});

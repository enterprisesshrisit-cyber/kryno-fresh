import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS } from '../lib/theme';

interface Props {
  title: string;
  artist: string;
  progress?: number;
}

export default function MiniMusicBar({ title, artist, progress: initP = 0.42 }: Props) {
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(initP);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.18, duration: 550, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    if (playing) a.start(); else a.stop();
    return () => a.stop();
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setProgress(p => Math.min(p + 0.003, 1)), 300);
    return () => clearInterval(t);
  }, [playing]);

  return (
    <LinearGradient
      colors={['rgba(99,102,241,0.16)', 'rgba(139,92,246,0.08)']}
      style={styles.container}
    >
      <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]}>
        <LinearGradient colors={['#6366F1', '#EC4899']} style={styles.dotGrad}>
          <Ionicons name="musical-notes" size={12} color="white" />
        </LinearGradient>
      </Animated.View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.artist}>{artist}</Text>
      </View>
      <View style={styles.progressWrap}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
      <TouchableOpacity onPress={() => setPlaying(p => !p)} style={styles.playBtn}>
        <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.playGrad}>
          <Ionicons name={playing ? 'pause' : 'play'} size={12} color="white" />
        </LinearGradient>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.22)',
    gap: 10,
  },
  dot: { width: 32, height: 32 },
  dotGrad: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: FONTS.sm, fontWeight: FONTS.semibold, color: COLORS.text },
  artist: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 1 },
  progressWrap: { width: 40 },
  track: { height: 2.5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: 2.5, backgroundColor: COLORS.primary, borderRadius: 2 },
  playBtn: { borderRadius: 14 },
  playGrad: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

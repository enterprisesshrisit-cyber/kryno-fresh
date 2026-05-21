import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export type ChatThemeType = 'dark_glass' | 'breathing_3d' | 'minimal_calm' | 'premium_aura';

// ─── DARK GLASS DEFAULT ──────────────────────────────────────────────────────
function DarkGlassBg() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#05070F', '#080B18', '#05070F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle noise grid */}
      <View style={styles.noiseLayer} />
      {/* Soft corner glows */}
      <View style={[styles.cornerGlow, { top: -60, left: -60, backgroundColor: 'rgba(99,102,241,0.07)' }]} />
      <View style={[styles.cornerGlow, { bottom: -60, right: -60, backgroundColor: 'rgba(139,92,246,0.06)' }]} />
    </View>
  );
}

// ─── 3D BREATHING THEME ──────────────────────────────────────────────────────
function Breathing3DBg() {
  const blob1 = useRef(new Animated.Value(0)).current;
  const blob2 = useRef(new Animated.Value(0)).current;
  const blob3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (anim: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }),
        ])
      );
    const a1 = animate(blob1, 6000, 0);
    const a2 = animate(blob2, 7500, 1500);
    const a3 = animate(blob3, 5500, 3000);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  const b1Scale = blob1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const b1Opacity = blob1.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.06, 0.12, 0.06] });
  const b2Scale = blob2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const b2Opacity = blob2.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.05, 0.1, 0.05] });
  const b3Scale = blob3.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const b3Opacity = blob3.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.04, 0.09, 0.04] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#040610', '#070A16', '#040610']}
        style={StyleSheet.absoluteFill}
      />
      {/* Blob 1 — top left */}
      <Animated.View style={[styles.blob, {
        top: height * 0.05, left: -width * 0.2,
        width: width * 0.8, height: width * 0.8,
        borderRadius: width * 0.4,
        backgroundColor: '#6366F1',
        transform: [{ scale: b1Scale }],
        opacity: b1Opacity,
      }]} />
      {/* Blob 2 — center right */}
      <Animated.View style={[styles.blob, {
        top: height * 0.3, right: -width * 0.25,
        width: width * 0.85, height: width * 0.85,
        borderRadius: width * 0.425,
        backgroundColor: '#8B5CF6',
        transform: [{ scale: b2Scale }],
        opacity: b2Opacity,
      }]} />
      {/* Blob 3 — bottom */}
      <Animated.View style={[styles.blob, {
        bottom: height * 0.05, left: width * 0.1,
        width: width * 0.7, height: width * 0.7,
        borderRadius: width * 0.35,
        backgroundColor: '#06B6D4',
        transform: [{ scale: b3Scale }],
        opacity: b3Opacity,
      }]} />
      {/* Depth overlay */}
      <LinearGradient
        colors={['rgba(4,6,16,0.3)', 'transparent', 'rgba(4,6,16,0.3)']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// ─── MINIMAL CALM ────────────────────────────────────────────────────────────
function MinimalCalmBg() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#040509' }]} />
      {/* Ultra-subtle texture lines */}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={[
          styles.textureLine,
          { top: (height / 8) * i, opacity: 0.018 + (i % 2) * 0.008 }
        ]} />
      ))}
      {/* Single soft glow, very dim */}
      <View style={[styles.cornerGlow, {
        top: height * 0.2, left: width * 0.1,
        width: width * 0.5, height: width * 0.5,
        borderRadius: width * 0.25,
        backgroundColor: 'rgba(99,102,241,0.04)',
      }]} />
    </View>
  );
}

// ─── PREMIUM AURA THEME ──────────────────────────────────────────────────────
function PremiumAuraBg() {
  const auraShift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(auraShift, { toValue: 1, duration: 8000, useNativeDriver: true }),
        Animated.timing(auraShift, { toValue: 0, duration: 8000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const translateY = auraShift.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const opacity1 = auraShift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.09, 0.15, 0.09] });
  const opacity2 = auraShift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.07, 0.12, 0.07] });

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#05060F', '#080A18', '#060510']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Animated aura orb 1 */}
      <Animated.View style={[styles.auraOrb, {
        top: -height * 0.1,
        left: -width * 0.1,
        width: width * 1.1,
        height: width * 1.1,
        borderRadius: width * 0.55,
        transform: [{ translateY }],
        opacity: opacity1,
      }]}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6', '#EC4899']}
          style={{ flex: 1, borderRadius: width * 0.55 }}
        />
      </Animated.View>
      {/* Aura orb 2 */}
      <Animated.View style={[styles.auraOrb, {
        bottom: -height * 0.15,
        right: -width * 0.15,
        width: width * 0.9,
        height: width * 0.9,
        borderRadius: width * 0.45,
        transform: [{ translateY: translateY }],
        opacity: opacity2,
      }]}>
        <LinearGradient
          colors={['#06B6D4', '#6366F1']}
          style={{ flex: 1, borderRadius: width * 0.45 }}
        />
      </Animated.View>
      {/* Readability overlay */}
      <LinearGradient
        colors={['rgba(5,6,15,0.55)', 'rgba(5,6,15,0.35)', 'rgba(5,6,15,0.55)']}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────
export default function ChatBackground({ theme }: { theme: ChatThemeType }) {
  switch (theme) {
    case 'breathing_3d': return <Breathing3DBg />;
    case 'minimal_calm': return <MinimalCalmBg />;
    case 'premium_aura': return <PremiumAuraBg />;
    default: return <DarkGlassBg />;
  }
}

const styles = StyleSheet.create({
  noiseLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.025,
    backgroundColor: 'transparent',
    // subtle repeating dot pattern via border
    borderWidth: 0,
  },
  cornerGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
  },
  blob: {
    position: 'absolute',
  },
  textureLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,1)',
  },
  auraOrb: {
    position: 'absolute',
  },
});

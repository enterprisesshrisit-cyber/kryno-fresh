import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS } from '../lib/theme';

/**
 * KrynoLogo — premium brand mark
 * Icon: hexagonal crystal mark with inner K geometry
 * Wordmark: spaced premium lettering
 */
export default function KrynoLogo() {
  return (
    <View style={styles.root}>
      {/* Icon Mark */}
      <View style={styles.iconWrap}>
        {/* Outer glow halo */}
        <View style={styles.glowHalo} />
        <LinearGradient
          colors={['#818CF8', '#6366F1', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconGrad}
        >
          {/* Inner geometric mark */}
          <View style={styles.iconInner}>
            {/* Top diamond */}
            <View style={styles.diamondTop} />
            {/* K stem */}
            <View style={styles.kStem} />
            {/* K arms */}
            <View style={styles.kArmTop} />
            <View style={styles.kArmBot} />
          </View>
        </LinearGradient>
      </View>

      {/* Wordmark */}
      <View style={styles.wordmarkWrap}>
        <Text style={styles.wordmark}>KRYNO</Text>
        <View style={styles.wordmarkUnderline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Icon
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHalo: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99,102,241,0.18)',
  },
  iconGrad: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
  },
  iconInner: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  diamondTop: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    transform: [{ rotate: '45deg' }],
  },
  kStem: {
    position: 'absolute',
    left: 4,
    top: 2,
    width: 2.5,
    height: 14,
    backgroundColor: 'white',
    borderRadius: 1.5,
  },
  kArmTop: {
    position: 'absolute',
    left: 6,
    top: 4,
    width: 8,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
    transform: [{ rotate: '-32deg' }],
  },
  kArmBot: {
    position: 'absolute',
    left: 6,
    top: 10,
    width: 8,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
    transform: [{ rotate: '32deg' }],
  },

  // Wordmark
  wordmarkWrap: {
    gap: 2,
  },
  wordmark: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 3.5,
    includeFontPadding: false,
  },
  wordmarkUnderline: {
    height: 1.5,
    width: '60%',
    borderRadius: 1,
    backgroundColor: 'rgba(99,102,241,0.55)',
  },
});

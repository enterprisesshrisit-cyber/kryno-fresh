import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  size: number;
  colors: string[];
  children: React.ReactNode;
  thickness?: number;
  speed?: number;
  glowColor?: string;
}

export default function AuraRing({ size, colors, children, thickness = 3, speed = 2400, glowColor }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.07, duration: speed, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: speed, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: speed, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.55, duration: speed, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const innerSize = size - thickness * 2 - 4;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer glow halo */}
      {glowColor && (
        <View style={{
          position: 'absolute',
          width: size + 16,
          height: size + 16,
          borderRadius: (size + 16) / 2,
          backgroundColor: glowColor,
          opacity: 0.18,
        }} />
      )}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale }],
          opacity,
        }}
      >
        <LinearGradient
          colors={colors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      </Animated.View>
      <View style={{
        width: innerSize,
        height: innerSize,
        borderRadius: innerSize / 2,
        backgroundColor: '#05070F',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {children}
      </View>
    </View>
  );
}

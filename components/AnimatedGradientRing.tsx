import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  size: number;
  colors: string[];
  children: React.ReactNode;
  thickness?: number;
  breathing?: boolean;
}

export default function AnimatedGradientRing({ size, colors, children, thickness = 3, breathing = true }: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (!breathing) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1.06, duration: 2200, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.6, duration: 2200, useNativeDriver: true }),
        ]),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, []);

  const innerSize = size - thickness * 2 - 4;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
          position: 'absolute',
        }}
      >
        <LinearGradient
          colors={colors as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      </Animated.View>
      <View
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: innerSize / 2,
          backgroundColor: '#050810',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

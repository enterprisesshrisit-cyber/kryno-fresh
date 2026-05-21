import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, SPACING } from '../lib/theme';

const STORY_SIZE = 66;

function StoryBubble({ story }: { story: any }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 120 }).start();
  };

  if (story.isAdd) {
    return (
      <TouchableOpacity style={styles.storyWrapper} activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <LinearGradient
            colors={['rgba(99,102,241,0.3)', 'rgba(139,92,246,0.2)']}
            style={[styles.ring, { borderColor: 'transparent' }]}
          >
            <View style={[styles.inner, { backgroundColor: '#0A0D1A', alignItems: 'center', justifyContent: 'center' }]}>
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                style={styles.addBtn}
              >
                <Ionicons name="add" size={22} color="white" />
              </LinearGradient>
            </View>
          </LinearGradient>
          <Text style={styles.storyLabel}>Add</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.storyWrapper} activeOpacity={1} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <LinearGradient
          colors={story.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ring}
        >
          <View style={styles.inner}>
            <Image
              source={{ uri: story.avatar }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          </View>
        </LinearGradient>
        <Text style={styles.storyLabel}>{story.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function StoriesRow({ stories }: { stories: any[] }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stories</Text>
        <TouchableOpacity>
          <Text style={styles.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {stories.map(story => (
          <StoryBubble key={story.id} story={story} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  seeAll: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: FONTS.weights.medium,
  },
  scroll: {
    gap: 14,
    paddingRight: SPACING.md,
  },
  storyWrapper: {
    alignItems: 'center',
    gap: 7,
  },
  ring: {
    width: STORY_SIZE + 6,
    height: STORY_SIZE + 6,
    borderRadius: (STORY_SIZE + 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2.5,
  },
  inner: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    backgroundColor: '#0A0D1A',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSub,
    fontWeight: FONTS.weights.medium,
  },
});

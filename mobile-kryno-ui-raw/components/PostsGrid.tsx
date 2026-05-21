import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACING } from '../lib/theme';

const { width } = Dimensions.get('window');
const COL_GAP = 10;
const PADDING = SPACING.md;
const COL_WIDTH = (width - PADDING * 2 - COL_GAP) / 2;

interface Post {
  id: string;
  image: string;
  locked: boolean;
  likes: number;
  comments: number;
  tall: boolean;
}

function PostCard({ post }: { post: Post }) {
  const [pressed, setPressed] = useState(false);
  const height = post.tall ? COL_WIDTH * 1.5 : COL_WIDTH;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.card,
        { height },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <Image
        source={{ uri: post.image }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
      />

      {post.locked ? (
        <View style={styles.lockedOverlay}>
          <View style={styles.blurLayer} />
          <View style={styles.lockContent}>
            <View style={styles.lockIcon}>
              <Ionicons name="lock-closed" size={20} color="white" />
            </View>
            <Text style={styles.lockText}>Inner Circle</Text>
          </View>
        </View>
      ) : (
        pressed && (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.hoverOverlay}
          >
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="heart" size={14} color="white" />
                <Text style={styles.statText}>{post.likes}</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="chatbubble" size={14} color="white" />
                <Text style={styles.statText}>{post.comments}</Text>
              </View>
            </View>
          </LinearGradient>
        )
      )}
    </TouchableOpacity>
  );
}

export default function PostsGrid({ posts }: { posts: Post[] }) {
  const leftPosts = posts.filter((_, i) => i % 2 === 0);
  const rightPosts = posts.filter((_, i) => i % 2 !== 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Posts</Text>
        <TouchableOpacity style={styles.gridToggle}>
          <Ionicons name="grid" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.grid}>
        <View style={styles.column}>
          {leftPosts.map(post => <PostCard key={post.id} post={post} />)}
        </View>
        <View style={styles.column}>
          {rightPosts.map(post => <PostCard key={post.id} post={post} />)}
        </View>
      </View>
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
  gridToggle: {
    padding: 6,
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderRadius: 10,
  },
  grid: {
    flexDirection: 'row',
    gap: COL_GAP,
  },
  column: {
    flex: 1,
    gap: COL_GAP,
  },
  card: {
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: '#0A0D1A',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,8,16,0.65)',
  },
  lockContent: {
    alignItems: 'center',
    gap: 8,
  },
  lockIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(99,102,241,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSub,
    fontWeight: FONTS.weights.semibold,
    letterSpacing: 0.8,
  },
  hoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.white,
    fontWeight: FONTS.weights.semibold,
  },
});

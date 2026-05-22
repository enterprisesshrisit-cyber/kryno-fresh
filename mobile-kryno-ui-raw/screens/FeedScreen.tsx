import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Dimensions, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACE, TIER, MOOD, type MoodType } from '../lib/theme';
import { FEED_POSTS } from '../lib/data';
import KrynoLogo from '../components/KrynoLogo';
import { useKrynoBackend } from '../lib/krynoBackend';

const { width } = Dimensions.get('window');

// ─── STORY BUBBLE ───────────────────────────────────────────────────────
function StoryBubble({ story, onAddStory, disabled }: { story: any; onAddStory: () => void; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const storyGradient = Array.isArray(story?.gradient) && story.gradient.length >= 2
    ? story.gradient
    : ['#6366F1', '#8B5CF6'];
  const storyLabel = typeof story?.label === 'string' && story.label.trim() ? story.label : 'Story';
  const press = () => {
    if (story?.isAdd) {
      onAddStory();
      return;
    }

    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 150 }),
    ]).start();
  };

  return (
    <TouchableOpacity onPress={press} activeOpacity={1} style={styles.storyWrap} disabled={disabled}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={storyGradient as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.storyRing}
        >
          <View style={styles.storyInner}>
            {story?.isAdd ? (
              <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.storyAdd}>
                <Ionicons name="add" size={20} color="white" />
              </LinearGradient>
            ) : (
              <Image source={{ uri: story?.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
          </View>
        </LinearGradient>
        <Text style={styles.storyLabel}>{storyLabel}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── FEED CARD ───────────────────────────────────────────────────────────────
function FeedCard({
  post,
  focusMode,
  onToggleLike,
}: {
  post: typeof FEED_POSTS[0] & { likedByMe?: boolean };
  focusMode: boolean;
  onToggleLike: (postId: string) => void;
}) {
  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likes, setLikes] = useState(post.likes);
  const [showActions, setShowActions] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const moodCfg = MOOD[post.mood as keyof typeof MOOD] ?? MOOD.chill;
  const tierCfg = TIER[post.user.tier as keyof typeof TIER] ?? TIER.Basic;

  React.useEffect(() => {
    setLiked(!!post.likedByMe);
    setLikes(post.likes);
  }, [post.likedByMe, post.likes]);

  const handleLike = () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikes(l => newLiked ? l + 1 : l - 1);
    onToggleLike(post.id);
    Animated.sequence([
      Animated.timing(likeScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, tension: 200 }),
    ]).start();
  };

  const handlePressIn = () => {
    Animated.timing(cardScale, { toValue: 0.985, duration: 120, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, tension: 120 }).start();
    setShowActions(true);
    setTimeout(() => setShowActions(false), 3000);
  };

  return (
    <Animated.View style={[styles.feedCard, { transform: [{ scale: cardScale }] }]}>
      {/* User Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardUser}>
          <View style={styles.cardAvatarWrap}>
            <LinearGradient colors={tierCfg.colors as any} style={styles.cardAvatarRing}>
              <Image source={{ uri: post.user.avatar }} style={styles.cardAvatar} contentFit="cover" />
            </LinearGradient>
            <View style={[styles.moodDot, { backgroundColor: moodCfg.color }]} />
          </View>
          <View style={styles.cardUserInfo}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName}>{post.user.name}</Text>
              <View style={[styles.tierPill, { backgroundColor: tierCfg.colors[0] + '22', borderColor: tierCfg.colors[0] + '44' }]}>
                <Text style={[styles.tierPillText, { color: tierCfg.colors[0] }]}>{post.user.tier === 'Inner Circle' ? '✦ IC' : post.user.tier}</Text>
              </View>
            </View>
            <Text style={styles.cardHandle}>{post.user.handle} · {post.timeAgo}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.cardMore}>
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Image */}
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.cardImageWrap}
      >
        {post.locked ? (
          <View style={styles.lockedContainer}>
            <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={18} />
            <LinearGradient colors={['rgba(5,7,15,0.5)', 'rgba(5,7,15,0.8)']} style={StyleSheet.absoluteFill} />
            <View style={styles.lockedContent}>
              <LinearGradient colors={['rgba(99,102,241,0.3)', 'rgba(139,92,246,0.2)']} style={styles.lockIcon}>
                <Ionicons name="lock-closed" size={22} color="white" />
              </LinearGradient>
              <Text style={styles.lockedTitle}>Inner Circle Exclusive</Text>
              <Text style={styles.lockedSub}>Unlock with premium membership</Text>
              <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.unlockCta}>
                <Text style={styles.unlockCtaText}>Unlock 🔓</Text>
              </LinearGradient>
            </View>
          </View>
        ) : (
          <Image source={{ uri: post.image }} style={styles.cardImage} contentFit="cover" transition={200} />
        )}

        {/* Gradient overlay */}
        {!post.locked && (
          <LinearGradient
            colors={['transparent', 'rgba(5,7,15,0.6)']}
            style={styles.cardImageOverlay}
          />
        )}

        {/* Mood tint */}
        <View style={[styles.moodTint, { backgroundColor: moodCfg.glow }]} pointerEvents="none" />
      </TouchableOpacity>

      {/* Caption */}
      {!focusMode && (
        <View style={styles.cardCaption}>
          <Text style={styles.captionText}>
            {post.caption.split(' ').map((word, i) =>
              post.captionKeywords?.some(k => word.includes(k))
                ? <Text key={i} style={styles.captionHighlight}>{word} </Text>
                : word + ' '
            )}
          </Text>
        </View>
      )}

      {/* Actions — appear on interaction */}
      <Animated.View style={[styles.cardActions, { opacity: showActions || !focusMode ? 1 : 0 }]}>
        <View style={styles.actionsLeft}>
          <TouchableOpacity onPress={handleLike} style={styles.actionBtn} activeOpacity={0.8}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={20}
                color={liked ? COLORS.pink : COLORS.textMuted}
              />
            </Animated.View>
            {!post.locked && <Text style={[styles.actionCount, liked && { color: COLORS.pink }]}>{likes}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}>
            <Ionicons name="chatbubble-outline" size={19} color={COLORS.textMuted} />
            {!post.locked && <Text style={styles.actionCount}>{post.comments}</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}>
          <Ionicons name="paper-plane-outline" size={19} color={COLORS.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const { feedPosts, refreshSocial, refreshing, stories, togglePostLike, createStoryFromMedia } = useKrynoBackend();
  const [focusMode, setFocusMode] = useState(false);
  const [storyBusy, setStoryBusy] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrollY.interpolate({ inputRange: [0, 60], outputRange: [1, 0], extrapolate: 'clamp' });
  const headerTranslate = scrollY.interpolate({ inputRange: [0, 60], outputRange: [0, -10], extrapolate: 'clamp' });

  const onRefresh = useCallback(() => {
    void refreshSocial();
  }, [refreshSocial]);

  const addStory = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a Kryno story.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.9,
      videoMaxDuration: 30
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      setStoryBusy(true);
      const asset = result.assets[0];
      await createStoryFromMedia({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        caption: ''
      });
    } catch (error) {
      Alert.alert('Story failed', error instanceof Error ? error.message : 'Story could not be uploaded.');
    } finally {
      setStoryBusy(false);
    }
  }, [createStoryFromMedia]);

  const renderHeader = () => (
    <View>
      {/* Animated Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerTranslate }] }]}>
        <View style={styles.headerLeft}>
          <KrynoLogo />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.focusBtn, focusMode && styles.focusBtnActive]}
            onPress={() => setFocusMode(f => !f)}
            activeOpacity={0.8}
          >
            <Ionicons name={focusMode ? 'eye-off-outline' : 'eye-outline'} size={16} color={focusMode ? COLORS.primary : COLORS.textMuted} />
            <Text style={[styles.focusBtnText, focusMode && { color: COLORS.primary }]}>Focus</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn}>
            <Ionicons name="notifications-outline" size={20} color={COLORS.textSub} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Stories */}
      {!focusMode && (
        <View style={styles.storiesSection}>
          <FlatList
            data={stories}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={i => i.id}
            renderItem={({ item }) => <StoryBubble story={item} onAddStory={addStory} disabled={storyBusy} />}
            contentContainerStyle={styles.storiesContent}
          />
        </View>
      )}

      {/* Section label */}
      <View style={styles.feedLabel}>
        <View style={styles.feedLabelDot} />
        <Text style={styles.feedLabelText}>{focusMode ? 'Focus Feed' : 'For You'}</Text>
        {focusMode && (
          <View style={styles.focusBadge}>
            <Text style={styles.focusBadgeText}>🧠 Focus Mode</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ambient glow */}
      <View style={styles.ambientTop} />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <Animated.FlatList
          data={feedPosts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <FeedCard
              post={item}
              focusMode={focusMode}
              onToggleLike={(postId) => {
                void togglePostLike(postId);
              }}
            />
          )}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.feedList}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  ambientTop: {
    position: 'absolute', top: -80, left: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(99,102,241,0.08)',
  },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACE.md, paddingTop: SPACE.sm, paddingBottom: SPACE.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  focusBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border,
  },
  focusBtnActive: { backgroundColor: COLORS.primarySoft, borderColor: 'rgba(99,102,241,0.35)' },
  focusBtnText: { fontSize: FONTS.xs, color: COLORS.textMuted, fontWeight: FONTS.medium },
  headerIconBtn: { position: 'relative', padding: 4 },
  notifDot: {
    position: 'absolute', top: 4, right: 4,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: COLORS.pink, borderWidth: 1.5, borderColor: COLORS.bg,
  },

  // Stories
  storiesSection: { paddingBottom: SPACE.md },
  storiesContent: { paddingHorizontal: SPACE.md, gap: 14 },
  storyWrap: { alignItems: 'center', gap: 6 },
  storyRing: { width: 68, height: 68, borderRadius: 34, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  storyInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.bgMid, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  storyAdd: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  storyLabel: { fontSize: FONTS.xs, color: COLORS.textSub, fontWeight: FONTS.medium },

  // Feed label
  feedLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: SPACE.md, paddingBottom: SPACE.md },
  feedLabelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  feedLabelText: { fontSize: FONTS.xs, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: FONTS.semibold },
  focusBadge: { backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  focusBadgeText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.semibold },

  // Feed list
  feedList: { paddingBottom: 100 },

  // Feed Card
  feedCard: {
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.lg,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, paddingBottom: 12 },
  cardUser: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardAvatarWrap: { position: 'relative' },
  cardAvatarRing: { width: 44, height: 44, borderRadius: 14, padding: 2, alignItems: 'center', justifyContent: 'center' },
  cardAvatar: { width: 38, height: 38, borderRadius: 11 },
  moodDot: { position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: COLORS.bg },
  cardUserInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardName: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.text },
  tierPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, borderWidth: 1 },
  tierPillText: { fontSize: 10, fontWeight: FONTS.bold, letterSpacing: 0.3 },
  cardHandle: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 2 },
  cardMore: { padding: 4 },

  // Image
  cardImageWrap: { position: 'relative', height: width - SPACE.md * 2 - 2 },
  cardImage: { width: '100%', height: '100%' },
  cardImageOverlay: { ...StyleSheet.absoluteFillObject },
  moodTint: { ...StyleSheet.absoluteFillObject, opacity: 0.08 },

  // Locked
  lockedContainer: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  lockedContent: { alignItems: 'center', gap: 10 },
  lockIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)' },
  lockedTitle: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.text },
  lockedSub: { fontSize: FONTS.sm, color: COLORS.textMuted },
  unlockCta: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.full },
  unlockCtaText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.white },

  // Caption
  cardCaption: { paddingHorizontal: SPACE.md, paddingTop: 12, paddingBottom: 4 },
  captionText: { fontSize: FONTS.base, color: COLORS.textSub, lineHeight: 22, letterSpacing: 0.1 },
  captionHighlight: { color: COLORS.primaryLight, fontWeight: FONTS.semibold },

  // Actions
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: 12 },
  actionsLeft: { flexDirection: 'row', gap: 18 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionCount: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },
});

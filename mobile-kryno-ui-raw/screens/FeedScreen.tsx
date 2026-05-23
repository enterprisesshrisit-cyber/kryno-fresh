import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Dimensions, StatusBar, Alert, Modal, TextInput,
  KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACE, TIER, MOOD, type MoodType, type TierType } from '../lib/theme';
import KrynoLogo from '../components/KrynoLogo';
import { useKrynoBackend } from '../lib/krynoBackend';
import StoryViewerModal from '../components/StoryViewerModal';

const { width } = Dimensions.get('window');

type FeedCardPost = {
  id: string;
  username?: string;
  user: {
    name: string;
    handle: string;
    avatar: string;
    tier: TierType;
  };
  image: string;
  caption: string;
  captionKeywords: string[];
  timeAgo: string;
  likes: number;
  comments: number;
  locked: boolean;
  mood: MoodType;
  likedByMe?: boolean;
  mediaKind?: 'text' | 'image' | 'video';
  commentItems?: Array<{
    id: string;
    body: string;
    createdAt: string;
    username: string;
    displayName: string;
  }>;
};

function normalizeUsername(value?: string) {
  return (value ?? '').replace(/^@/, '').trim();
}

function formatCommentTime(value?: string) {
  if (!value) {
    return 'now';
  }

  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    return 'now';
  }

  const minutes = Math.max(1, Math.floor((Date.now() - createdAt.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ─── STORY BUBBLE ───────────────────────────────────────────────────────
function StoryBubble({
  story,
  onAddStory,
  onOpenStory,
  disabled
}: {
  story: any;
  onAddStory: () => void;
  onOpenStory: (storyId: string) => void;
  disabled?: boolean;
}) {
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

    onOpenStory(story.id);
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
  onOpenProfile,
  onOpenComments,
  onOpenMenu,
  onSharePost,
}: {
  post: FeedCardPost;
  focusMode: boolean;
  onToggleLike: (postId: string) => void;
  onOpenProfile: (username: string) => void;
  onOpenComments: (post: FeedCardPost) => void;
  onOpenMenu: (post: FeedCardPost) => void;
  onSharePost: (post: FeedCardPost) => void;
}) {
  const [liked, setLiked] = useState(!!post.likedByMe);
  const [likes, setLikes] = useState(post.likes);
  const [showActions, setShowActions] = useState(false);
  const likeScale = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const moodCfg = MOOD[post.mood as keyof typeof MOOD] ?? MOOD.chill;
  const tierCfg = TIER[post.user.tier as keyof typeof TIER] ?? TIER.Basic;
  const hasMedia = typeof post.image === 'string' && post.image.trim().length > 0;

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
        <TouchableOpacity
          style={styles.cardUser}
          onPress={() => onOpenProfile(post.username || post.user.handle)}
          activeOpacity={0.8}
        >
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
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardMore} onPress={() => onOpenMenu(post)} activeOpacity={0.8}>
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
        {post.locked && hasMedia ? (
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
        ) : hasMedia ? (
          <Image source={{ uri: post.image }} style={styles.cardImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.textPostMedia}>
            <Ionicons name="document-text-outline" size={30} color={COLORS.primary} />
          </View>
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
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8} onPress={() => onOpenComments(post)}>
            <Ionicons name="chatbubble-outline" size={19} color={COLORS.textMuted} />
            {!post.locked && <Text style={styles.actionCount}>{post.comments}</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8} onPress={() => onSharePost(post)}>
          <Ionicons name="paper-plane-outline" size={19} color={COLORS.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function FeedScreen() {
  const {
    feedPosts,
    refreshSocial,
    refreshing,
    stories,
    currentUser,
    togglePostLike,
    commentOnPost,
    deletePost,
    createStoryFromMedia,
    createPostFromMedia,
    viewStory
  } = useKrynoBackend();
  const navigation = useNavigation<any>();
  const [focusMode, setFocusMode] = useState(false);
  const [storyBusy, setStoryBusy] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [commentsPost, setCommentsPost] = useState<FeedCardPost | null>(null);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [menuPost, setMenuPost] = useState<FeedCardPost | null>(null);
  const [storyViewerId, setStoryViewerId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerOpacity = scrollY.interpolate({ inputRange: [0, 60], outputRange: [1, 0], extrapolate: 'clamp' });
  const headerTranslate = scrollY.interpolate({ inputRange: [0, 60], outputRange: [0, -10], extrapolate: 'clamp' });

  const onRefresh = useCallback(() => {
    void refreshSocial();
  }, [refreshSocial]);

  const openProfile = useCallback(
    (value: string) => {
      const username = normalizeUsername(value);
      if (username) {
        navigation.navigate('PublicProfile', { username });
      }
    },
    [navigation]
  );

  const openComments = useCallback((post: FeedCardPost) => {
    setCommentsPost(post);
    setCommentText('');
  }, []);

  const sharePost = useCallback(async (post: FeedCardPost) => {
    const caption = post.caption?.trim() || 'Shared a Kryno post.';
    await Share.share({
      message: `${post.user.name} on KRYNO: ${caption}`
    });
  }, []);

  const submitComment = useCallback(async () => {
    const body = commentText.trim();
    if (!commentsPost || !body || commentBusy) {
      return;
    }

    try {
      setCommentBusy(true);
      await commentOnPost(commentsPost.id, body);
      const now = new Date().toISOString();
      setCommentsPost((current) =>
        current
          ? {
              ...current,
              comments: current.comments + 1,
              commentItems: [
                ...(current.commentItems ?? []),
                {
                  id: `local-${Date.now()}`,
                  body,
                  createdAt: now,
                  username: normalizeUsername(currentUser.handle),
                  displayName: currentUser.name
                }
              ]
            }
          : current
      );
      setCommentText('');
    } catch (error) {
      Alert.alert('Comment failed', error instanceof Error ? error.message : 'Comment could not be added.');
    } finally {
      setCommentBusy(false);
    }
  }, [commentBusy, commentOnPost, commentText, commentsPost, currentUser.handle, currentUser.name]);

  const closeMenu = useCallback(() => {
    if (!deleteBusy) {
      setMenuPost(null);
    }
  }, [deleteBusy]);

  const handleDeletePost = useCallback(async () => {
    if (!menuPost || deleteBusy) {
      return;
    }

    try {
      setDeleteBusy(true);
      await deletePost(menuPost.id);
      setMenuPost(null);
    } catch (error) {
      Alert.alert('Delete failed', error instanceof Error ? error.message : 'Post could not be deleted.');
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, deletePost, menuPost]);

  const addStory = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to add a Kryno story.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      base64: true,
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
        bytesBase64: asset.base64,
        caption: ''
      });
    } catch (error) {
      Alert.alert('Story failed', error instanceof Error ? error.message : 'Story could not be uploaded.');
    } finally {
      setStoryBusy(false);
    }
  }, [createStoryFromMedia]);

  const pickPostMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to publish Kryno posts.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      base64: true,
      quality: 0.9,
      videoMaxDuration: 60
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      setPostBusy(true);
      const asset = result.assets[0];
      await createPostFromMedia({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        bytesBase64: asset.base64,
        caption: ''
      });
    } catch (error) {
      Alert.alert('Post failed', error instanceof Error ? error.message : 'Post media could not be uploaded.');
    } finally {
      setPostBusy(false);
    }
  }, [createPostFromMedia]);

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
          <TouchableOpacity style={styles.headerIconBtn} onPress={pickPostMedia} disabled={postBusy}>
            <Ionicons name={postBusy ? 'cloud-upload-outline' : 'add'} size={22} color={COLORS.textSub} />
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
            renderItem={({ item }) => (
              <StoryBubble
                story={item}
                onAddStory={addStory}
                onOpenStory={setStoryViewerId}
                disabled={storyBusy}
              />
            )}
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

  const menuPostIsMine =
    !!menuPost &&
    normalizeUsername(menuPost.username || menuPost.user.handle).toLowerCase() ===
      normalizeUsername(currentUser.handle).toLowerCase();
  const visibleComments = commentsPost?.commentItems ?? [];

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
              onOpenProfile={openProfile}
              onOpenComments={openComments}
              onOpenMenu={setMenuPost}
              onSharePost={(post) => {
                void sharePost(post);
              }}
            />
          )}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            <View style={styles.emptyFeed}>
              <Ionicons name="images-outline" size={34} color={COLORS.primary} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyCopy}>Your feed will show real Kryno posts here.</Text>
              <TouchableOpacity style={styles.emptyCta} onPress={pickPostMedia} disabled={postBusy} activeOpacity={0.85}>
                <Ionicons name={postBusy ? 'cloud-upload-outline' : 'add'} size={17} color={COLORS.white} />
                <Text style={styles.emptyCtaText}>{postBusy ? 'Uploading...' : 'Post photo or video'}</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={styles.feedList}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      </SafeAreaView>

      <Modal
        visible={!!commentsPost}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentsPost(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.commentSheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Comments</Text>
                <Text style={styles.sheetSubtitle}>{commentsPost?.user.name ?? 'Kryno post'}</Text>
              </View>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setCommentsPost(null)}>
                <Ionicons name="close" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={visibleComments}
              keyExtractor={(item) => item.id}
              style={styles.commentList}
              ListEmptyComponent={
                <View style={styles.emptyComments}>
                  <Ionicons name="chatbubble-outline" size={28} color={COLORS.primary} />
                  <Text style={styles.emptyCommentsText}>No comments yet</Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{(item.displayName || item.username || 'K').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.commentBubble}>
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.commentAuthor}>{item.displayName || item.username}</Text>
                      <Text style={styles.commentTime}>{formatCommentTime(item.createdAt)}</Text>
                    </View>
                    <Text style={styles.commentBody}>{item.body}</Text>
                  </View>
                </View>
              )}
            />

            <View style={styles.commentInputRow}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Add a comment"
                placeholderTextColor={COLORS.textMuted}
                style={styles.commentInput}
                multiline
              />
              <TouchableOpacity
                style={[styles.commentSend, (!commentText.trim() || commentBusy) && styles.commentSendDisabled]}
                onPress={submitComment}
                disabled={!commentText.trim() || commentBusy}
                activeOpacity={0.85}
              >
                <Ionicons name={commentBusy ? 'hourglass-outline' : 'send'} size={17} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!menuPost} transparent animationType="fade" onRequestClose={closeMenu}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Post options</Text>
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                const post = menuPost;
                setMenuPost(null);
                if (post) openProfile(post.username || post.user.handle);
              }}
            >
              <Ionicons name="person-outline" size={18} color={COLORS.textSub} />
              <Text style={styles.menuActionText}>View profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuAction}
              onPress={() => {
                const post = menuPost;
                setMenuPost(null);
                if (post) void sharePost(post);
              }}
            >
              <Ionicons name="paper-plane-outline" size={18} color={COLORS.textSub} />
              <Text style={styles.menuActionText}>Share post</Text>
            </TouchableOpacity>
            {menuPostIsMine ? (
              <TouchableOpacity style={styles.menuAction} onPress={handleDeletePost} disabled={deleteBusy}>
                <Ionicons name="trash-outline" size={18} color={COLORS.pink} />
                <Text style={[styles.menuActionText, styles.menuActionDanger]}>
                  {deleteBusy ? 'Deleting...' : 'Delete post'}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.menuCancel} onPress={closeMenu}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <StoryViewerModal
        visible={!!storyViewerId}
        stories={stories}
        initialStoryId={storyViewerId}
        onClose={() => setStoryViewerId(null)}
        onMarkViewed={viewStory}
      />
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
  emptyFeed: {
    marginHorizontal: SPACE.md,
    marginTop: SPACE.lg,
    padding: SPACE.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    gap: 10
  },
  emptyTitle: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.text },
  emptyCopy: { fontSize: FONTS.sm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  emptyCta: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary
  },
  emptyCtaText: { fontSize: FONTS.sm, color: COLORS.white, fontWeight: FONTS.bold },

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
  textPostMedia: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSurface
  },
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

  // Comments and menu
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end'
  },
  commentSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.md,
    paddingBottom: SPACE.lg,
    gap: 12
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: FONTS.lg, color: COLORS.text, fontWeight: FONTS.bold },
  sheetSubtitle: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 2 },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  commentList: { maxHeight: 360 },
  emptyComments: { alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 8 },
  emptyCommentsText: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySofter,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)'
  },
  commentAvatarText: { color: COLORS.primaryLight, fontWeight: FONTS.bold, fontSize: FONTS.sm },
  commentBubble: { flex: 1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, padding: 10, borderWidth: 1, borderColor: COLORS.border },
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  commentAuthor: { color: COLORS.text, fontSize: FONTS.sm, fontWeight: FONTS.semibold },
  commentTime: { color: COLORS.textMuted, fontSize: FONTS.xs },
  commentBody: { color: COLORS.textSub, fontSize: FONTS.sm, lineHeight: 19 },
  commentInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgMid,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FONTS.sm
  },
  commentSend: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary
  },
  commentSendDisabled: { opacity: 0.45 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
    padding: SPACE.md
  },
  menuSheet: {
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.bgSurface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACE.md,
    gap: 6
  },
  menuTitle: { color: COLORS.text, fontSize: FONTS.base, fontWeight: FONTS.bold, marginBottom: 4 },
  menuAction: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  menuActionText: { color: COLORS.textSub, fontSize: FONTS.base, fontWeight: FONTS.medium },
  menuActionDanger: { color: COLORS.pink },
  menuCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass
  },
  menuCancelText: { color: COLORS.text, fontSize: FONTS.sm, fontWeight: FONTS.bold },
});

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import AuraRing from '../components/AuraRing';
import PremiumBadge from '../components/PremiumBadge';
import StoryViewerModal from '../components/StoryViewerModal';
import { COLORS, FONTS, RADIUS, SPACE, TIER } from '../lib/theme';
import { useKrynoBackend } from '../lib/krynoBackend';

type RouteParams = {
  username?: string;
};

function safeProfileError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/refresh token reuse|invalid refresh token|refresh token expired|access token expired|please refresh your session|device mismatch/i.test(message)) {
    return 'Session expired, please login again.';
  }
  if (/secure relay is reconnecting|secure relay is not connected|direct relay socket|relay error/i.test(message)) {
    return 'Connecting call service. Please try again in a few seconds.';
  }
  return message || fallback;
}

export default function PublicProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const username = String((route.params as RouteParams | undefined)?.username ?? '').replace(/^@/, '');
  const {
    currentUser,
    feedPosts,
    stories,
    getSocialProfile,
    toggleFollow,
    ensureConversationForUser,
    startConversationCall,
    viewStory
  } = useKrynoBackend();
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [storyViewerId, setStoryViewerId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setProfile(await getSocialProfile(username));
    } catch (error) {
      Alert.alert('Profile failed', safeProfileError(error, 'Could not load that profile.'));
    } finally {
      setLoading(false);
    }
  }, [getSocialProfile, username]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const posts = useMemo(
    () => feedPosts.filter((post) => post.username === username || post.user.handle.replace(/^@/, '') === username),
    [feedPosts, username]
  );

  const userStories = useMemo(
    () => stories.filter((story: any) => !story.isAdd && story.username === username),
    [stories, username]
  );

  const displayName = profile?.displayName || username || 'Kryno';
  const handle = profile?.username ? `@${profile.username}` : `@${username}`;
  const avatarUrl =
    profile?.avatarUrl ||
    `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(username || 'Kryno')}&backgroundColor=111827&fontColor=e5e7eb`;
  const isMe = handle === currentUser.handle;
  const tier = profile?.tier || 'Basic';
  const tierCfg = TIER[tier as keyof typeof TIER] ?? TIER.Basic;
  const canMessage = !isMe;

  const chatUser = useMemo(
    () => ({
      id: profile?.userId,
      username: profile?.username || username,
      displayName,
      avatarUrl,
      tier,
      online: true,
      mood: 'chill'
    }),
    [avatarUrl, displayName, profile?.userId, profile?.username, tier, username]
  );

  const openChat = useCallback(() => {
    if (!canMessage) return;
    const conversation = ensureConversationForUser(chatUser as any);
    navigation.navigate('Messages', {
      screen: 'Chat',
      params: { conversation }
    });
  }, [canMessage, chatUser, ensureConversationForUser, navigation]);

  const handleFollow = useCallback(async () => {
    if (!profile || isMe) return;

    try {
      setBusy(true);
      await toggleFollow(profile.username, Boolean(profile.isFollowing));
      await loadProfile();
    } catch (error) {
      Alert.alert('Follow failed', safeProfileError(error, 'Could not update follow.'));
    } finally {
      setBusy(false);
    }
  }, [isMe, loadProfile, profile, toggleFollow]);

  const startCall = useCallback(
    async (mode: 'audio' | 'video') => {
      if (!canMessage) return;
      try {
        const conversation = ensureConversationForUser(chatUser as any);
        await startConversationCall(conversation, mode);
      } catch (error) {
        Alert.alert(
          mode === 'video' ? 'Video call failed' : 'Audio call failed',
          safeProfileError(error, 'Could not start this call right now.')
        );
      }
    },
    [canMessage, chatUser, ensureConversationForUser, startConversationCall]
  );

  const openStory = useCallback(() => {
    if (userStories[0]?.id) {
      setStoryViewerId(userStories[0].id);
      return;
    }
    Alert.alert('No active story', `${displayName} has no active story right now.`);
  }, [displayName, userStories]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.topActions}>
              <TouchableOpacity style={styles.iconButton} onPress={loadProfile} disabled={loading}>
                <Ionicons name="refresh" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => Alert.alert('Profile options', 'Report/block controls will be enforced from the moderation backend phase.')}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>
          </View>

          <LinearGradient colors={['rgba(99,102,241,0.18)', 'rgba(6,182,212,0.06)', 'rgba(5,7,15,0)']} style={styles.heroGlow} />
          <View style={styles.hero}>
            <TouchableOpacity onPress={openStory} activeOpacity={0.86}>
              <AuraRing size={156} colors={userStories.length ? ['#EC4899', '#8B5CF6', '#06B6D4'] : tierCfg.colors}>
                <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
              </AuraRing>
              {userStories.length > 0 && (
                <View style={styles.storyBadge}>
                  <Ionicons name="play" size={12} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.nameBlock}>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.handle}>{handle}</Text>
            </View>

            <View style={styles.badgesRow}>
              <View style={styles.statusPill}>
                <View style={styles.onlineDot} />
                <Text style={styles.statusText}>Active recently</Text>
              </View>
              <PremiumBadge tier={tier} />
            </View>

            <Text style={styles.bio}>{profile?.bio || 'No bio yet.'}</Text>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryAction} onPress={handleFollow} disabled={busy || isMe} activeOpacity={0.86}>
                <LinearGradient
                  colors={profile?.isFollowing ? ['rgba(99,102,241,0.25)', 'rgba(139,92,246,0.16)'] : ['#6366F1', '#8B5CF6']}
                  style={styles.actionGrad}
                >
                  <Text style={styles.primaryActionText}>{isMe ? 'This is you' : profile?.isFollowing ? 'Following' : busy ? 'Working...' : 'Follow'}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryAction} onPress={openChat} disabled={!canMessage}>
                <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => void startCall('audio')} disabled={!canMessage}>
                <Ionicons name="call-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => void startCall('video')} disabled={!canMessage}>
                <Ionicons name="videocam-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statsCard}>
            <Stat value={posts.length} label="Posts" onPress={() => undefined} />
            <Stat value={Number(profile?.followersCount ?? 0)} label="Followers" onPress={() => Alert.alert('Followers', 'Follower list backend route is not implemented yet.')} />
            <Stat value={Number(profile?.followingCount ?? 0)} label="Following" onPress={() => Alert.alert('Following', 'Following list backend route is not implemented yet.')} />
            <Stat value={userStories.length} label="Stories" onPress={openStory} />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Highlights</Text>
              <Text style={styles.sectionAction}>View</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
              {userStories.length ? (
                userStories.slice(0, 6).map((story: any) => (
                  <TouchableOpacity key={story.id} style={styles.highlightItem} onPress={() => setStoryViewerId(story.id)}>
                    <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.highlightRing}>
                      <Image source={{ uri: story.avatar || avatarUrl }} style={styles.highlightAvatar} contentFit="cover" />
                    </LinearGradient>
                    <Text style={styles.highlightLabel} numberOfLines={1}>{story.label || 'Story'}</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyWide}>
                  <Ionicons name="sparkles-outline" size={24} color={COLORS.primary} />
                  <Text style={styles.emptyTitle}>No highlights yet</Text>
                  <Text style={styles.emptyCopy}>Highlights will appear here after stories are saved.</Text>
                </View>
              )}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Posts</Text>
              <Text style={styles.sectionAction}>{posts.length} visible</Text>
            </View>
            {posts.length ? (
              <View style={styles.postGrid}>
                {posts.map((post) => (
                  <TouchableOpacity key={post.id} style={styles.postCard} activeOpacity={0.86}>
                    {post.image ? (
                      <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={styles.textPost}>
                        <Ionicons name="document-text-outline" size={24} color={COLORS.primary} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyWide}>
                <Ionicons name="images-outline" size={28} color={COLORS.primary} />
                <Text style={styles.emptyTitle}>No visible posts</Text>
                <Text style={styles.emptyCopy}>Public or follower-visible posts will appear here.</Text>
              </View>
            )}
          </View>

          <View style={{ height: 110 }} />
        </ScrollView>
      </SafeAreaView>
      <StoryViewerModal
        visible={!!storyViewerId}
        stories={userStories}
        initialStoryId={storyViewerId}
        onClose={() => setStoryViewerId(null)}
        onMarkViewed={viewStory}
      />
    </View>
  );
}

function Stat({ value, label, onPress }: { value: number; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress} activeOpacity={0.82}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 20 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACE.md, alignItems: 'center' },
  topActions: { flexDirection: 'row', gap: 10 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroGlow: { position: 'absolute', top: 42, left: 0, right: 0, height: 280 },
  hero: { alignItems: 'center', paddingHorizontal: SPACE.md, gap: 12 },
  avatar: { width: 132, height: 132, borderRadius: 66 },
  storyBadge: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nameBlock: { alignItems: 'center', gap: 3 },
  name: { fontSize: FONTS.xxl, color: COLORS.text, fontWeight: FONTS.black, textAlign: 'center' },
  handle: { fontSize: FONTS.base, color: COLORS.textMuted },
  badgesRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.28)',
    backgroundColor: 'rgba(16,185,129,0.11)'
  },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  statusText: { color: COLORS.success, fontSize: FONTS.xs, fontWeight: FONTS.semibold },
  bio: { fontSize: FONTS.base, color: COLORS.textSub, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACE.md },
  actionRow: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryAction: { flex: 1, borderRadius: RADIUS.full, overflow: 'hidden' },
  actionGrad: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  primaryActionText: { color: COLORS.white, fontSize: FONTS.base, fontWeight: FONTS.bold },
  secondaryAction: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.28)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statsCard: {
    margin: SPACE.md,
    flexDirection: 'row',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    paddingVertical: 14
  },
  stat: { flex: 1, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  statValue: { fontSize: FONTS.lg, color: COLORS.text, fontWeight: FONTS.bold },
  statLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, textTransform: 'uppercase', marginTop: 2 },
  section: { paddingHorizontal: SPACE.md, marginTop: 4, gap: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: FONTS.lg, color: COLORS.text, fontWeight: FONTS.bold },
  sectionAction: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.semibold },
  highlightsRow: { gap: 14, minHeight: 118 },
  highlightItem: { width: 78, alignItems: 'center', gap: 7 },
  highlightRing: { width: 72, height: 72, borderRadius: 36, padding: 3 },
  highlightAvatar: { flex: 1, borderRadius: 33, backgroundColor: COLORS.bgMid },
  highlightLabel: { color: COLORS.textSub, fontSize: FONTS.xs, fontWeight: FONTS.semibold },
  postGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  postCard: { width: '48%', aspectRatio: 1, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.bgSurface },
  textPost: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWide: {
    width: '100%',
    minHeight: 150,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: SPACE.lg
  },
  emptyTitle: { color: COLORS.text, fontSize: FONTS.base, fontWeight: FONTS.bold },
  emptyCopy: { color: COLORS.textMuted, fontSize: FONTS.sm, textAlign: 'center' }
});

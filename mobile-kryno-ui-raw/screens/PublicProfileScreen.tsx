import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import AuraRing from '../components/AuraRing';
import { COLORS, FONTS, RADIUS, SPACE } from '../lib/theme';
import { useKrynoBackend } from '../lib/krynoBackend';

type RouteParams = {
  username?: string;
};

export default function PublicProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const username = String((route.params as RouteParams | undefined)?.username ?? '').replace(/^@/, '');
  const { currentUser, feedPosts, getSocialProfile, toggleFollow } = useKrynoBackend();
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setProfile(await getSocialProfile(username));
    } catch (error) {
      Alert.alert('Profile failed', error instanceof Error ? error.message : 'Could not load that profile.');
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

  const handleFollow = useCallback(async () => {
    if (!profile || profile.username === currentUser.handle.replace(/^@/, '')) {
      return;
    }

    try {
      setBusy(true);
      await toggleFollow(profile.username, Boolean(profile.isFollowing));
      await loadProfile();
    } catch (error) {
      Alert.alert('Follow failed', error instanceof Error ? error.message : 'Could not update follow.');
    } finally {
      setBusy(false);
    }
  }, [currentUser.handle, loadProfile, profile, toggleFollow]);

  const displayName = profile?.displayName || username || 'Kryno';
  const handle = profile?.username ? `@${profile.username}` : `@${username}`;
  const avatarUrl = profile?.avatarUrl || `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(username || 'Kryno')}&backgroundColor=111827&fontColor=e5e7eb`;
  const isMe = handle === currentUser.handle;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={loadProfile} disabled={loading}>
              <Ionicons name="refresh" size={18} color={COLORS.textSub} />
            </TouchableOpacity>
          </View>

          <View style={styles.hero}>
            <AuraRing size={150} colors={['#6366F1', '#8B5CF6', '#06B6D4']}>
              <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            </AuraRing>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.handle}>{handle}</Text>
            <Text style={styles.bio}>{profile?.bio || 'No bio yet.'}</Text>
            <View style={styles.stats}>
              <Stat value={posts.length} label="Posts" />
              <Stat value={Number(profile?.followersCount ?? 0)} label="Followers" />
              <Stat value={Number(profile?.followingCount ?? 0)} label="Following" />
            </View>
            <TouchableOpacity
              style={[styles.followButton, isMe && styles.followButtonMuted]}
              onPress={handleFollow}
              disabled={busy || isMe || loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={profile?.isFollowing ? ['rgba(99,102,241,0.22)', 'rgba(139,92,246,0.16)'] : ['#6366F1', '#8B5CF6']}
                style={styles.followGradient}
              >
                <Text style={styles.followText}>{isMe ? 'This is you' : profile?.isFollowing ? 'Following' : busy ? 'Working...' : 'Follow'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.postsSection}>
            <Text style={styles.sectionTitle}>Posts</Text>
            {posts.length ? (
              <View style={styles.postGrid}>
                {posts.map((post) => (
                  <View key={post.id} style={styles.postCard}>
                    {post.image ? (
                      <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={styles.textPost}>
                        <Ionicons name="document-text-outline" size={24} color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={28} color={COLORS.primary} />
                <Text style={styles.emptyTitle}>No public posts yet</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACE.md },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingHorizontal: SPACE.md, gap: 10 },
  avatar: { width: 130, height: 130, borderRadius: 65 },
  name: { fontSize: FONTS.xxl, color: COLORS.text, fontWeight: FONTS.black, textAlign: 'center' },
  handle: { fontSize: FONTS.base, color: COLORS.textMuted },
  bio: { fontSize: FONTS.base, color: COLORS.textSub, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACE.md },
  stats: { width: '100%', flexDirection: 'row', borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, marginTop: 10, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FONTS.lg, color: COLORS.text, fontWeight: FONTS.bold },
  statLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, textTransform: 'uppercase', marginTop: 2 },
  followButton: { width: '100%', borderRadius: RADIUS.full, overflow: 'hidden', marginTop: 6 },
  followButtonMuted: { opacity: 0.72 },
  followGradient: { alignItems: 'center', paddingVertical: 13 },
  followText: { color: COLORS.white, fontSize: FONTS.base, fontWeight: FONTS.bold },
  postsSection: { padding: SPACE.md, gap: 12 },
  sectionTitle: { fontSize: FONTS.lg, color: COLORS.text, fontWeight: FONTS.bold },
  postGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  postCard: { width: '48%', aspectRatio: 1, borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.bgSurface },
  textPost: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 150, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { color: COLORS.textSub, fontSize: FONTS.base, fontWeight: FONTS.semibold }
});

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Animated, Dimensions, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACE, MOOD, TIER } from '../lib/theme';
import { DISCOVER_POSTS, DISCOVER_CATEGORIES, FEATURED_MEMBERS } from '../lib/data';
import GlassCard from '../components/GlassCard';
import PremiumBadge from '../components/PremiumBadge';
import { useKrynoBackend } from '../lib/krynoBackend';

const { width } = Dimensions.get('window');
const COL = (width - SPACE.md * 2 - 10) / 2;

// ─── VIBE CARD ───────────────────────────────────────────────────────────────
const VIBES = [
  { id: 'v1', label: 'Midnight', emoji: '🌙', colors: ['#1a0533', '#0d0d2b'] as string[], accent: '#8B5CF6' },
  { id: 'v2', label: 'Golden Hour', emoji: '☀️', colors: ['#2d1a00', '#1a0d00'] as string[], accent: '#F59E0B' },
  { id: 'v3', label: 'Neon City', emoji: '🏙', colors: ['#001a2e', '#000d1a'] as string[], accent: '#06B6D4' },
  { id: 'v4', label: 'Solitude', emoji: '🏔', colors: ['#0f1923', '#080f17'] as string[], accent: '#6366F1' },
];

function VibeCard({ vibe }: { vibe: typeof VIBES[0] }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => Animated.timing(scale, { toValue: 0.95, duration: 100, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 150 }).start()}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={vibe.colors as any}
          style={[styles.vibeCard, { borderColor: vibe.accent + '30' }]}
        >
          <View style={[styles.vibeAccentDot, { backgroundColor: vibe.accent + '30' }]}>
            <View style={[styles.vibeAccentInner, { backgroundColor: vibe.accent }]} />
          </View>
          <Text style={styles.vibeEmoji}>{vibe.emoji}</Text>
          <Text style={[styles.vibeLabel, { color: vibe.accent }]}>{vibe.label}</Text>
        </LinearGradient>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── MASONRY GRID ───────────────────────────────────────────────────────────────
function MasonryPost({ post }: { post: typeof DISCOVER_POSTS[0] }) {
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const h = post.tall ? COL * 1.55 : COL * 0.85;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { setPressed(true); Animated.timing(scale, { toValue: 0.96, duration: 120, useNativeDriver: true }).start(); }}
      onPressOut={() => { setTimeout(() => setPressed(false), 1200); Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120 }).start(); }}
    >
      <Animated.View style={[styles.masonryCard, { height: h, transform: [{ scale }] }]}>
        <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        {pressed && (
          <LinearGradient colors={['transparent', 'rgba(5,7,15,0.8)']} style={styles.masonryOverlay}>
            <View style={styles.masonryStats}>
              <Ionicons name="heart" size={13} color="white" />
              <Text style={styles.masonryStat}>{post.likes}</Text>
            </View>
          </LinearGradient>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── MEMBER CHIP ───────────────────────────────────────────────────────────────
function MemberChip({
  member,
  onToggleFollow,
}: {
  member: typeof FEATURED_MEMBERS[0] & { isFollowing?: boolean };
  onToggleFollow: (member: typeof FEATURED_MEMBERS[0] & { isFollowing?: boolean }) => void;
}) {
  const [following, setFollowing] = useState(!!member.isFollowing);
  const moodCfg = MOOD[member.mood];
  const tierCfg = TIER[member.tier];

  React.useEffect(() => {
    setFollowing(!!member.isFollowing);
  }, [member.isFollowing]);

  return (
    <GlassCard style={styles.memberChip}>
      <View style={styles.memberChipTop}>
        <View style={{ position: 'relative' }}>
          <LinearGradient colors={tierCfg.colors as any} style={styles.memberChipAvatarRing}>
            <Image source={{ uri: member.avatar }} style={styles.memberChipAvatar} contentFit="cover" />
          </LinearGradient>
          {member.online && <View style={styles.memberChipOnline} />}
        </View>
        <View style={styles.memberChipInfo}>
          <Text style={styles.memberChipName} numberOfLines={1}>{member.name}</Text>
          <Text style={styles.memberChipHandle}>{member.handle}</Text>
        </View>
        <Text style={styles.memberChipMood}>{moodCfg.icon}</Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          setFollowing(f => !f);
          onToggleFollow(member);
        }}
        style={styles.memberChipFollowBtn}
        activeOpacity={0.85}
      >
        {following ? (
          <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.memberChipFollowGrad}>
            <Text style={styles.memberChipFollowTextActive}>Following ✓</Text>
          </LinearGradient>
        ) : (
          <Text style={styles.memberChipFollowText}>Follow</Text>
        )}
      </TouchableOpacity>
    </GlassCard>
  );
}

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function DiscoverScreen() {
  const { discoverPosts, discoverCategories, featuredMembers, toggleFollow } = useKrynoBackend();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const onSearchFocus = () => {
    setSearchFocused(true);
    Animated.timing(searchAnim, { toValue: 1, duration: 250, useNativeDriver: false }).start();
  };
  const onSearchBlur = () => {
    setSearchFocused(false);
    Animated.timing(searchAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };

  const borderColor = searchAnim.interpolate({ inputRange: [0, 1], outputRange: [COLORS.border, 'rgba(99,102,241,0.5)'] });

  const filteredPosts = discoverPosts.filter(p =>
    activeCategory === 'all' || p.category === activeCategory
  );
  const leftCol = filteredPosts.filter((_, i) => i % 2 === 0);
  const rightCol = filteredPosts.filter((_, i) => i % 2 !== 0);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Discover</Text>
            <Text style={styles.headerSub}>Curated for your world</Text>
          </View>

          {/* Search */}
          <Animated.View style={[styles.searchBar, { borderColor }]}>
            <Ionicons name="search" size={17} color={searchFocused ? COLORS.primary : COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people, vibes, moments..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </Animated.View>

          {/* Vibe Discovery */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Explore by Vibe</Text>
              <Text style={styles.sectionSub}>Not algorithm — intention</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.vibesRow}>
                {VIBES.map(v => <VibeCard key={v.id} vibe={v} />)}
              </View>
            </ScrollView>
          </View>

          {/* Featured Members */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Members</Text>
              <TouchableOpacity><Text style={styles.seeAll}>See all</Text></TouchableOpacity>
            </View>
            <FlatList
              data={featuredMembers}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={i => i.id}
              renderItem={({ item }) => (
                <MemberChip
                  member={item}
                  onToggleFollow={(member) => {
                    void toggleFollow(member.handle.replace(/^@/, ''), !!member.isFollowing);
                  }}
                />
              )}
              contentContainerStyle={styles.membersRow}
            />
          </View>

          {/* Category Pills */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Curated Moments</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.categoriesRow}>
                {discoverCategories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setActiveCategory(cat.id)}
                    style={[
                      styles.categoryPill,
                      activeCategory === cat.id && styles.categoryPillActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.categoryText, activeCategory === cat.id && styles.categoryTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Masonry Grid */}
            <View style={styles.masonryGrid}>
              <View style={styles.masonryCol}>
                {leftCol.map(p => <MasonryPost key={p.id} post={p} />)}
              </View>
              <View style={styles.masonryCol}>
                {rightCol.map(p => <MasonryPost key={p.id} post={p} />)}
              </View>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.sm },
  headerTitle: { fontSize: FONTS.xxl, fontWeight: FONTS.black, color: COLORS.text, letterSpacing: -0.8 },
  headerSub: { fontSize: FONTS.sm, color: COLORS.textMuted, marginTop: 3 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACE.md, marginBottom: SPACE.lg,
    paddingHorizontal: SPACE.md, paddingVertical: 13,
    backgroundColor: COLORS.bgGlass,
    borderRadius: RADIUS.lg, borderWidth: 1, gap: 10,
  },
  searchInput: { flex: 1, fontSize: FONTS.base, color: COLORS.text },

  section: { marginBottom: SPACE.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: SPACE.md, marginBottom: 14 },
  sectionTitle: { fontSize: FONTS.md, fontWeight: FONTS.bold, color: COLORS.text, letterSpacing: -0.2 },
  sectionSub: { fontSize: FONTS.xs, color: COLORS.textMuted },
  seeAll: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.medium },

  // Vibes
  vibesRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACE.md, paddingRight: SPACE.md * 2 },
  vibeCard: {
    width: 110, height: 80, borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, gap: 4, position: 'relative', overflow: 'hidden',
  },
  vibeAccentDot: { position: 'absolute', top: -10, right: -10, width: 40, height: 40, borderRadius: 20 },
  vibeAccentInner: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4 },
  vibeEmoji: { fontSize: 22 },
  vibeLabel: { fontSize: FONTS.xs, fontWeight: FONTS.bold, letterSpacing: 0.3 },

  // Members
  membersRow: { paddingHorizontal: SPACE.md, gap: 10, paddingRight: SPACE.md * 2 },
  memberChip: { width: 160, padding: 12, gap: 10 },
  memberChipTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberChipAvatarRing: { width: 38, height: 38, borderRadius: 12, padding: 2, alignItems: 'center', justifyContent: 'center' },
  memberChipAvatar: { width: 32, height: 32, borderRadius: 9 },
  memberChipOnline: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.success, borderWidth: 2, borderColor: COLORS.bg },
  memberChipInfo: { flex: 1 },
  memberChipName: { fontSize: FONTS.sm, fontWeight: FONTS.semibold, color: COLORS.text },
  memberChipHandle: { fontSize: FONTS.xs, color: COLORS.textMuted },
  memberChipMood: { fontSize: 16 },
  memberChipFollowBtn: {
    borderRadius: RADIUS.full, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)',
    alignItems: 'center',
  },
  memberChipFollowGrad: { width: '100%', paddingVertical: 7, alignItems: 'center' },
  memberChipFollowText: { fontSize: FONTS.xs, color: COLORS.primary, fontWeight: FONTS.semibold, paddingVertical: 7 },
  memberChipFollowTextActive: { fontSize: FONTS.xs, color: COLORS.white, fontWeight: FONTS.semibold },

  // Categories
  categoriesRow: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACE.md, marginBottom: 14 },
  categoryPill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border,
  },
  categoryPillActive: { backgroundColor: COLORS.primarySoft, borderColor: 'rgba(99,102,241,0.4)' },
  categoryText: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },
  categoryTextActive: { color: COLORS.primary, fontWeight: FONTS.semibold },

  // Masonry
  masonryGrid: { flexDirection: 'row', paddingHorizontal: SPACE.md, gap: 10 },
  masonryCol: { flex: 1, gap: 10 },
  masonryCard: { borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.bgSurface },
  masonryOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 10 },
  masonryStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  masonryStat: { fontSize: FONTS.xs, color: COLORS.white, fontWeight: FONTS.semibold },
});

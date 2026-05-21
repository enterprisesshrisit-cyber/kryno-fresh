import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACING } from '../lib/theme';

const FEATURED_MEMBERS = [
  { id: '1', name: 'Zara Khan', handle: '@zara.k', tier: 'Inner Circle', avatar: 'https://i.pravatar.cc/150?img=47', mood: '🌙', online: true },
  { id: '2', name: 'Dev Sharma', handle: '@dev.sh', tier: 'Elite', avatar: 'https://i.pravatar.cc/150?img=33', mood: '🔥', online: true },
  { id: '3', name: 'Priya Nair', handle: '@priya.n', tier: 'Inner Circle', avatar: 'https://i.pravatar.cc/150?img=45', mood: '🧠', online: false },
  { id: '4', name: 'Rishi Patel', handle: '@rishi.p', tier: 'Basic', avatar: 'https://i.pravatar.cc/150?img=12', mood: '🌙', online: true },
  { id: '5', name: 'Aisha Malik', handle: '@aisha.m', tier: 'Elite', avatar: 'https://i.pravatar.cc/150?img=49', mood: '🔥', online: false },
  { id: '6', name: 'Kabir Sen', handle: '@kabir.s', tier: 'Inner Circle', avatar: 'https://i.pravatar.cc/150?img=52', mood: '🧠', online: true },
];

const TIER_COLORS: Record<string, string> = {
  'Inner Circle': '#06B6D4',
  'Elite': '#F59E0B',
  'Basic': '#6366F1',
};

function MemberCard({ member }: { member: typeof FEATURED_MEMBERS[0] }) {
  const [following, setFollowing] = useState(false);
  const tierColor = TIER_COLORS[member.tier];

  return (
    <TouchableOpacity activeOpacity={0.88} style={styles.memberCard}>
      <LinearGradient
        colors={['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
        style={styles.memberCardGrad}
      >
        <View style={styles.memberTop}>
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: member.avatar }}
              style={styles.memberAvatar}
              contentFit="cover"
            />
            {member.online && <View style={styles.onlineDot} />}
          </View>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{member.name}</Text>
            <Text style={styles.memberHandle}>{member.handle}</Text>
            <View style={[styles.tierBadge, { backgroundColor: tierColor + '20', borderColor: tierColor + '40' }]}>
              <Text style={[styles.tierText, { color: tierColor }]}>{member.tier}</Text>
            </View>
          </View>
          <Text style={styles.moodEmoji}>{member.mood}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.followBtn,
            following && styles.followBtnActive,
          ]}
          onPress={() => setFollowing(!following)}
          activeOpacity={0.8}
        >
          {following ? (
            <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followBtnGrad}>
              <Text style={styles.followBtnTextActive}>Following ✓</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.followBtnText}>Follow</Text>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function ExploreScreen() {
  const [search, setSearch] = useState('');

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
          <Text style={styles.subtitle}>Discover Kryno members</Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search members..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.filterRow}>
          {['All', 'Inner Circle', 'Elite', 'Active'].map(f => (
            <TouchableOpacity key={f} style={styles.filterChip} activeOpacity={0.8}>
              <Text style={styles.filterText}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={FEATURED_MEMBERS.filter(m =>
            search === '' || m.name.toLowerCase().includes(search.toLowerCase())
          )}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <MemberCard member={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: 4 },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: COLORS.bgGlass,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterText: { fontSize: FONTS.sizes.xs, color: COLORS.textSub, fontWeight: FONTS.weights.medium },
  list: { paddingHorizontal: SPACING.md, gap: 12, paddingBottom: 100 },
  memberCard: { borderRadius: RADIUS.xl, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  memberCardGrad: { padding: SPACING.md, gap: 14 },
  memberTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarContainer: { position: 'relative' },
  memberAvatar: { width: 52, height: 52, borderRadius: 16 },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 13, height: 13, borderRadius: 7,
    backgroundColor: COLORS.success,
    borderWidth: 2, borderColor: COLORS.bg,
  },
  memberInfo: { flex: 1, gap: 3 },
  memberName: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text },
  memberHandle: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  tierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.full, borderWidth: 1, marginTop: 2,
  },
  tierText: { fontSize: 10, fontWeight: FONTS.weights.bold, letterSpacing: 0.5 },
  moodEmoji: { fontSize: 22 },
  followBtn: {
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  followBtnActive: { borderColor: 'transparent', padding: 0 },
  followBtnGrad: { width: '100%', paddingVertical: 10, alignItems: 'center' },
  followBtnText: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.primary },
  followBtnTextActive: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.white },
});

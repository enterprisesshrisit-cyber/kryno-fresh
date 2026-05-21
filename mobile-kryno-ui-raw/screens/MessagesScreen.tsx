import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, StatusBar, Modal, Dimensions, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS, RADIUS, SPACE, MOOD, TIER, STATUS } from '../lib/theme';
import { CONVERSATIONS } from '../lib/data';
import GlassCard from '../components/GlassCard';
import { useKrynoBackend } from '../lib/krynoBackend';

const { width, height } = Dimensions.get('window');

// ─── PROFILE PREVIEW MODAL ──────────────────────────────────────────────────────────
function ProfilePreviewModal({ user, visible, onClose }: { user: any; visible: boolean; onClose: () => void }) {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!user) return null;
  const tierCfg = TIER[user.tier as keyof typeof TIER];
  const moodCfg = MOOD[user.mood as keyof typeof MOOD];

  return (
    <Modal transparent visible={visible} onRequestClose={onClose} animationType="none">
      <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>
      <Animated.View style={[styles.profileModal, { transform: [{ translateY: slideAnim }] }]}>
        <LinearGradient
          colors={['rgba(12,16,32,0.98)', 'rgba(5,7,15,1)']}
          style={styles.profileModalInner}
        >
          {/* Handle */}
          <View style={styles.modalHandle} />

          {/* Avatar + Info */}
          <View style={styles.modalHero}>
            <LinearGradient colors={tierCfg.colors as any} style={styles.modalAvatarRing}>
              <Image source={{ uri: user.avatar }} style={styles.modalAvatar} contentFit="cover" />
            </LinearGradient>
            <View style={styles.modalUserInfo}>
              <Text style={styles.modalName}>{user.name}</Text>
              <Text style={styles.modalHandleText}>{user.handle}</Text>
              <View style={styles.modalBadgesRow}>
                <View style={[styles.moodBadge, { backgroundColor: moodCfg.glow }]}>
                  <Text style={styles.moodBadgeText}>{moodCfg.icon} {moodCfg.label}</Text>
                </View>
                <LinearGradient colors={tierCfg.colors as any} style={styles.tierBadgeModal}>
                  <Text style={styles.tierBadgeModalText}>{tierCfg.icon} {user.tier}</Text>
                </LinearGradient>
              </View>
            </View>
          </View>

          {/* Online indicator */}
          {user.online && (
            <View style={styles.onlineRow}>
              <View style={styles.onlinePulse} />
              <Text style={styles.onlineText}>Active now</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalActionBtn} onPress={onClose} activeOpacity={0.8}>
              <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.modalActionGrad}>
                <Ionicons name="chatbubble" size={18} color="white" />
                <Text style={styles.modalActionText}>Message</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalActionSecondary} activeOpacity={0.8}>
              <Ionicons name="person-add-outline" size={16} color={COLORS.primary} />
              <Text style={styles.modalActionSecondaryText}>Follow</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalActionIcon} activeOpacity={0.8}>
              <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

// ─── CONVERSATION ROW ───────────────────────────────────────────────────────────────
function ConversationRow({ convo, onAvatarPress, onPress }: { convo: typeof CONVERSATIONS[0]; onAvatarPress: () => void; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tierCfg = TIER[convo.user.tier as keyof typeof TIER];
  const moodCfg = MOOD[convo.user.mood as keyof typeof MOOD];

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => Animated.timing(scale, { toValue: 0.98, duration: 100, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 150 }).start()}
      onPress={onPress}
    >
      <Animated.View style={[styles.convoRow, { transform: [{ scale }] }]}>
        {convo.pinned && <View style={styles.pinnedBar} />}
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.85}>
          <View style={styles.convoAvatarWrap}>
            <LinearGradient colors={tierCfg.colors as any} style={styles.convoAvatarRing}>
              <Image source={{ uri: convo.user.avatar }} style={styles.convoAvatar} contentFit="cover" />
            </LinearGradient>
            {convo.user.online && <View style={styles.convoOnlineDot} />}
            <View style={[styles.convoMoodDot, { backgroundColor: moodCfg.color }]}>
              <Text style={{ fontSize: 8 }}>{moodCfg.icon}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.convoContent}>
          <View style={styles.convoTopRow}>
            <Text style={[styles.convoName, convo.unread > 0 && styles.convoNameUnread]}>
              {convo.user.name}
            </Text>
            <Text style={[styles.convoTime, convo.unread > 0 && styles.convoTimeUnread]}>
              {convo.time}
            </Text>
          </View>
          <View style={styles.convoBottomRow}>
            <Text style={[styles.convoLast, convo.unread > 0 && styles.convoLastUnread]} numberOfLines={1}>
              {convo.lastMessage}
            </Text>
            {convo.unread > 0 && (
              <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>{convo.unread}</Text>
              </LinearGradient>
            )}
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function MessagesScreen() {
  const navigation = useNavigation<any>();
  const { conversationSeeds, searchUsers, ensureConversationForUser } = useKrynoBackend();
  const [previewUser, setPreviewUser] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const openPreview = (user: any) => {
    setPreviewUser(user);
    setShowPreview(true);
  };

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results = await searchUsers(value);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  const openConversationFromSearch = (user: any) => {
    const conversation = ensureConversationForUser(user);
    setSearchVisible(false);
    setSearchQuery('');
    setSearchResults([]);
    navigation.navigate('Chat', { conversation });
  };

  const pinnedConvos = conversationSeeds.filter(c => c.pinned);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Messages</Text>
            <Text style={styles.headerSub}>{conversationSeeds.filter(c => c.unread > 0).length} unread</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setSearchVisible(true)}>
              <Ionicons name="search" size={19} color={COLORS.textSub} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn}>
              <Ionicons name="create-outline" size={19} color={COLORS.textSub} />
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={conversationSeeds}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={() => (
            <View>
              {/* Pinned */}
              {pinnedConvos.length > 0 && (
                <View style={styles.section}>
                  <View style={styles.sectionLabel}>
                    <Ionicons name="pin" size={11} color={COLORS.textMuted} />
                    <Text style={styles.sectionLabelText}>Pinned</Text>
                  </View>
                </View>
              )}
            </View>
          )}
          renderItem={({ item }) => (
            <ConversationRow
              convo={item}
              onAvatarPress={() => openPreview(item.user)}
              onPress={() => navigation.navigate('Chat', { conversation: item })}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </SafeAreaView>

      <ProfilePreviewModal
        user={previewUser}
        visible={showPreview}
        onClose={() => setShowPreview(false)}
      />

      <Modal transparent visible={searchVisible} onRequestClose={() => setSearchVisible(false)} animationType="fade">
        <View style={styles.searchModalBackdrop}>
          <View style={styles.searchModalCard}>
            <View style={styles.searchModalHeader}>
              <Text style={styles.searchModalTitle}>Find people</Text>
              <TouchableOpacity onPress={() => setSearchVisible(false)} style={styles.searchModalClose}>
                <Ionicons name="close" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder="Search username or name"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Text style={styles.searchEmptyText}>
                  {searching ? 'Searching...' : searchQuery.trim() ? 'No people found.' : 'Start typing to search.'}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.searchResultRow} activeOpacity={0.85} onPress={() => openConversationFromSearch(item)}>
                  <Image source={{ uri: item.avatar_url || `https://i.pravatar.cc/150?u=${encodeURIComponent(item.username)}` }} style={styles.searchResultAvatar} contentFit="cover" />
                  <View style={styles.searchResultText}>
                    <Text style={styles.searchResultName}>{item.display_name || item.username}</Text>
                    <Text style={styles.searchResultHandle}>@{item.username}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACE.md, paddingTop: SPACE.md, paddingBottom: SPACE.lg,
  },
  headerTitle: { fontSize: FONTS.xxl, fontWeight: FONTS.black, color: COLORS.text, letterSpacing: -0.8 },
  headerSub: { fontSize: FONTS.sm, color: COLORS.textMuted, marginTop: 3 },
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  listContent: { paddingBottom: 100 },
  section: { paddingHorizontal: SPACE.md, marginBottom: 8 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sectionLabelText: { fontSize: FONTS.xs, color: COLORS.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: FONTS.semibold },

  // Conversation Row
  convoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACE.md, paddingVertical: 14, gap: 14,
    position: 'relative',
  },
  pinnedBar: { position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 2.5, borderRadius: 2, backgroundColor: COLORS.primary },
  convoAvatarWrap: { position: 'relative', width: 52, height: 52 },
  convoAvatarRing: { width: 52, height: 52, borderRadius: 17, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  convoAvatar: { width: 44, height: 44, borderRadius: 13 },
  convoOnlineDot: { position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: COLORS.success, borderWidth: 2.5, borderColor: COLORS.bg },
  convoMoodDot: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  convoContent: { flex: 1 },
  convoTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convoName: { fontSize: FONTS.base, fontWeight: FONTS.medium, color: COLORS.textSub },
  convoNameUnread: { fontWeight: FONTS.bold, color: COLORS.text },
  convoTime: { fontSize: FONTS.xs, color: COLORS.textMuted },
  convoTimeUnread: { color: COLORS.primary, fontWeight: FONTS.semibold },
  convoBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convoLast: { fontSize: FONTS.sm, color: COLORS.textMuted, flex: 1, marginRight: 8 },
  convoLastUnread: { color: COLORS.textSub, fontWeight: FONTS.medium },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadCount: { fontSize: FONTS.xs, color: COLORS.white, fontWeight: FONTS.bold },
  separator: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACE.md + 52 + 14 },

  // Profile Modal
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  profileModal: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  profileModalInner: { borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl, padding: SPACE.lg, paddingBottom: 40, borderTopWidth: 1, borderTopColor: COLORS.borderMid },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACE.lg },
  modalHero: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: SPACE.md },
  modalAvatarRing: { width: 68, height: 68, borderRadius: 22, padding: 3, alignItems: 'center', justifyContent: 'center' },
  modalAvatar: { width: 60, height: 60, borderRadius: 18 },
  modalUserInfo: { flex: 1, gap: 4 },
  modalName: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.text },
  modalHandleText: { fontSize: FONTS.sm, color: COLORS.textMuted },
  modalBadgesRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  moodBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  moodBadgeText: { fontSize: FONTS.xs, color: COLORS.text, fontWeight: FONTS.medium },
  tierBadgeModal: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  tierBadgeModalText: { fontSize: FONTS.xs, color: COLORS.white, fontWeight: FONTS.bold },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACE.lg },
  onlinePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  onlineText: { fontSize: FONTS.sm, color: COLORS.success, fontWeight: FONTS.medium },
  modalActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  modalActionBtn: { flex: 1, borderRadius: RADIUS.full, overflow: 'hidden' },
  modalActionGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  modalActionText: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.white },
  modalActionSecondary: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)',
  },
  modalActionSecondaryText: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.semibold },
  modalActionIcon: {
    width: 46, height: 46, borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },

  searchModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: SPACE.md,
  },
  searchModalCard: {
    maxHeight: height * 0.72,
    borderRadius: RADIUS.xl,
    backgroundColor: 'rgba(12,16,32,0.98)',
    borderWidth: 1,
    borderColor: COLORS.borderMid,
    padding: SPACE.md,
  },
  searchModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.md,
  },
  searchModalTitle: {
    fontSize: FONTS.lg,
    color: COLORS.text,
    fontWeight: FONTS.bold,
  },
  searchModalClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.bgGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgGlass,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: SPACE.md,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONTS.base,
    padding: 0,
  },
  searchEmptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACE.xl,
    fontSize: FONTS.sm,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  searchResultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
  },
  searchResultText: {
    flex: 1,
    gap: 2,
  },
  searchResultName: {
    color: COLORS.text,
    fontSize: FONTS.base,
    fontWeight: FONTS.semibold,
  },
  searchResultHandle: {
    color: COLORS.textMuted,
    fontSize: FONTS.sm,
  },
});

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Dimensions, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACE, MOOD, TIER, STATUS } from '../lib/theme';
import type { MoodType, StatusType, TierType } from '../lib/theme';
import { ME, PROFILE_POSTS, STORIES } from '../lib/data';
import GlassCard from '../components/GlassCard';
import AuraRing from '../components/AuraRing';
import PremiumBadge from '../components/PremiumBadge';
import MiniMusicBar from '../components/MiniMusicBar';
import { useKrynoBackend } from '../lib/krynoBackend';

const { width } = Dimensions.get('window');
const COL_GAP = 10;
const COL_W = (width - SPACE.md * 2 - COL_GAP) / 2;

// ─── STAT ITEM (animated count-up) ──────────────────────────────────────────────────────
function StatItem({ label, value }: { label: string; value: number }) {
  const [displayed, setDisplayed] = useState(0);
  const started = useRef(false);

  const startCount = useCallback(() => {
    if (started.current) return;
    started.current = true;
    let v = 0;
    const steps = 36;
    const inc = value / steps;
    const interval = setInterval(() => {
      v += inc;
      if (v >= value) { setDisplayed(value); clearInterval(interval); }
      else setDisplayed(Math.floor(v));
    }, 1000 / steps);
  }, [value]);

  const fmt = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  return (
    <TouchableOpacity style={styles.statItem} onPress={startCount} activeOpacity={0.8}>
      <Text style={styles.statValue}>{fmt(displayed)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── SMART BIO ──────────────────────────────────────────────────────────────────────────────
function SmartBio({ bio, keywords }: { bio: string; keywords: string[] }) {
  const words = bio.split(/(\s+)/);
  return (
    <Text style={styles.bioText}>
      {words.map((word, i) => {
        const isKw = keywords.some(k => word.toLowerCase().includes(k.toLowerCase()));
        return isKw
          ? <Text key={i} style={styles.bioKeyword}>{word}</Text>
          : <Text key={i}>{word}</Text>;
      })}
    </Text>
  );
}

// ─── POST CARD ────────────────────────────────────────────────────────────────────────────
function PostCard({ post }: { post: typeof PROFILE_POSTS[0] }) {
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const h = post.tall ? COL_W * 1.55 : COL_W * 0.9;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { setPressed(true); Animated.timing(scale, { toValue: 0.96, duration: 120, useNativeDriver: true }).start(); }}
      onPressOut={() => { setTimeout(() => setPressed(false), 1500); Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120 }).start(); }}
    >
      <Animated.View style={[styles.postCard, { height: h, transform: [{ scale }] }]}>
        <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />

        {post.locked ? (
          <View style={styles.postLocked}>
            <LinearGradient colors={['rgba(5,7,15,0.5)', 'rgba(5,7,15,0.85)']} style={StyleSheet.absoluteFill} />
            <View style={styles.postLockIcon}>
              <Ionicons name="lock-closed" size={16} color="white" />
            </View>
            <Text style={styles.postLockLabel}>IC</Text>
          </View>
        ) : (
          pressed && (
            <LinearGradient colors={['transparent', 'rgba(5,7,15,0.75)']} style={styles.postHoverOverlay}>
              <View style={styles.postStats}>
                <Ionicons name="heart" size={12} color="white" />
                <Text style={styles.postStat}>{post.likes}</Text>
                <Ionicons name="chatbubble" size={11} color="white" style={{ marginLeft: 6 }} />
                <Text style={styles.postStat}>{post.comments}</Text>
              </View>
            </LinearGradient>
          )
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── MEMBER CARD ───────────────────────────────────────────────────────────────────────────
function MemberCard({ tier, joinDate }: { tier: TierType; joinDate: string }) {
  const tierCfg = TIER[tier as keyof typeof TIER] ?? TIER.Basic;
  return (
    <LinearGradient
      colors={['rgba(99,102,241,0.18)', 'rgba(6,182,212,0.08)', 'rgba(139,92,246,0.12)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.memberCard}
    >
      <View style={styles.memberCardLeft}>
        <Text style={styles.memberCardLabel}>Kryno Member</Text>
        <Text style={styles.memberCardTier}>{tier}</Text>
        <Text style={styles.memberCardSince}>Since {joinDate}</Text>
      </View>
      <View style={styles.memberCardRight}>
        <LinearGradient colors={tierCfg.colors as any} style={styles.memberCardLogo}>
          <Text style={styles.memberCardLogoText}>K</Text>
        </LinearGradient>
        <Text style={styles.memberCardPrice}>₹200/mo</Text>
      </View>
    </LinearGradient>
  );
}

// ─── MOOD SELECTOR ────────────────────────────────────────────────────────────────────────
function MoodSelector({ mood, onChange }: { mood: MoodType; onChange: (m: MoodType) => void }) {
  const moods: MoodType[] = ['chill', 'social', 'focus'];
  return (
    <View style={styles.moodRow}>
      {moods.map(m => {
        const cfg = MOOD[m];
        const active = m === mood;
        return (
          <TouchableOpacity
            key={m}
            onPress={() => onChange(m)}
            style={[styles.moodBtn, active && { backgroundColor: cfg.glow + 'CC', borderColor: cfg.color + '55' }]}
            activeOpacity={0.8}
          >
            <Text style={styles.moodIcon}>{cfg.icon}</Text>
            <Text style={[styles.moodLabel, active && { color: cfg.color }]}>{cfg.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── PRIVACY TOGGLE ──────────────────────────────────────────────────────────────────────
function PrivacyToggle({ label, icon, on, onToggle }: { label: string; icon: any; on: boolean; onToggle: () => void }) {
  const slideAnim = useRef(new Animated.Value(on ? 1 : 0)).current;
  const toggle = () => {
    onToggle();
    Animated.spring(slideAnim, { toValue: on ? 0 : 1, useNativeDriver: false, tension: 150 }).start();
  };
  const thumbPos = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });
  const trackColor = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0.1)', 'rgba(99,102,241,0.5)'] });

  return (
    <View style={styles.privacyRow}>
      <Ionicons name={icon} size={16} color={COLORS.textMuted} />
      <Text style={styles.privacyLabel}>{label}</Text>
      <TouchableOpacity onPress={toggle} activeOpacity={0.85}>
        <Animated.View style={[styles.trackOuter, { backgroundColor: trackColor, borderColor: on ? 'rgba(99,102,241,0.4)' : COLORS.border }]}>
          <Animated.View style={[styles.thumb, { left: thumbPos, backgroundColor: on ? COLORS.primary : COLORS.textMuted }]} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

// ─── MAIN SCREEN ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { currentUser, profilePosts, stories, uploadProfilePhoto, createStoryFromMedia, createPostFromMedia } = useKrynoBackend();
  const user = currentUser;
  const [status, setStatus] = useState<StatusType>((user.status as StatusType) || 'active');
  const [mood, setMood] = useState<MoodType>((user.mood as MoodType) || 'chill');
  const [theme, setTheme] = useState('dark_glass');
  const [privacy, setPrivacy] = useState({ viewProfile: true, viewPosts: true, message: false });
  const [bioExpanded, setBioExpanded] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const moodCfg = MOOD[mood as keyof typeof MOOD] ?? MOOD.chill;
  const tierCfg = TIER[user.tier as keyof typeof TIER] ?? TIER.Basic;
  const statusCfg = STATUS[status as keyof typeof STATUS] ?? STATUS.active;
  const statusCycle: StatusType[] = ['active', 'focus', 'private'];

  const cycleStatus = () => {
    const idx = statusCycle.indexOf(status);
    setStatus(statusCycle[(idx + 1) % statusCycle.length]);
  };

  React.useEffect(() => {
    setStatus((user.status as StatusType) || 'active');
    setMood((user.mood as MoodType) || 'chill');
  }, [user.status, user.mood]);

  const pickProfilePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to update your Kryno profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      setMediaBusy(true);
      const asset = result.assets[0];
      await uploadProfilePhoto({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType
      });
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Profile photo could not be uploaded.');
    } finally {
      setMediaBusy(false);
    }
  }, [uploadProfilePhoto]);

  const pickStoryMedia = useCallback(async () => {
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
      setMediaBusy(true);
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
      setMediaBusy(false);
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
      quality: 0.9,
      videoMaxDuration: 60
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    try {
      setMediaBusy(true);
      const asset = result.assets[0];
      await createPostFromMedia({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        caption: ''
      });
    } catch (error) {
      Alert.alert('Post failed', error instanceof Error ? error.message : 'Post media could not be uploaded.');
    } finally {
      setMediaBusy(false);
    }
  }, [createPostFromMedia]);

  const leftPosts = profilePosts.filter((_, i) => i % 2 === 0);
  const rightPosts = profilePosts.filter((_, i) => i % 2 !== 0);

  const headerOpacity = scrollY.interpolate({ inputRange: [0, 120], outputRange: [0, 1], extrapolate: 'clamp' });

  const THEMES = [
    { id: 'dark_glass', label: 'Dark Glass', color: '#6366F1' },
    { id: 'cyber_neon', label: 'Cyber Neon', color: '#06B6D4' },
    { id: 'smooth_aura', label: 'Smooth Aura', color: '#8B5CF6' },
  ];

  const IMPRESSION_TAGS = [
    { label: 'Aesthetic', icon: '✨' },
    { label: 'Intelligent', icon: '🧠' },
    { label: 'Confident', icon: '🔥' },
    { label: 'Creative', icon: '🎨' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: COLORS.bg }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Ambient mood glow */}
      <View style={[styles.ambientGlow, { backgroundColor: moodCfg.glow }]} />
      <View style={styles.ambientGlow2} />

      {/* Floating sticky header */}
      <Animated.View style={[styles.stickyHeader, { opacity: headerOpacity }]}>
        <LinearGradient colors={['rgba(5,7,15,0.96)', 'rgba(5,7,15,0.85)']} style={styles.stickyHeaderBg}>
          <SafeAreaView edges={['top']}>
            <View style={styles.stickyHeaderContent}>
              <Text style={styles.stickyName}>{user.name}</Text>
              <View style={styles.stickyActions}>
                <TouchableOpacity style={styles.stickyBtn}>
                  <Ionicons name="share-outline" size={18} color={COLORS.textSub} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.stickyBtn}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSub} />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        <SafeAreaView edges={['top']}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topBarBtn}>
              <Ionicons name="chevron-back" size={20} color={COLORS.text} />
            </TouchableOpacity>
            <View style={styles.topBarRight}>
              <TouchableOpacity style={styles.topBarBtn}>
                <Ionicons name="share-outline" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topBarBtn}>
                <Ionicons name="settings-outline" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        {/* ── HERO ── */}
        <View style={styles.hero}>
          {/* Avatar with aura */}
          <TouchableOpacity
            style={styles.avatarSection}
            activeOpacity={0.88}
            onPress={pickProfilePhoto}
            disabled={mediaBusy}
          >
            <AuraRing
              size={126}
              colors={['#6366F1', '#8B5CF6', '#EC4899', '#6366F1']}
              thickness={3}
              speed={2600}
              glowColor={moodCfg.color}
            >
              <Image source={{ uri: user.avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            </AuraRing>

            {/* Verified aura badge */}
            <View style={styles.verifiedBadge}>
              <LinearGradient colors={tierCfg.colors as any} style={styles.verifiedGrad}>
                <Ionicons name={mediaBusy ? 'cloud-upload-outline' : 'camera'} size={15} color="white" />
              </LinearGradient>
            </View>
          </TouchableOpacity>

          {/* Name */}
          <View style={styles.nameBlock}>
            <Text style={styles.displayName}>{user.name}</Text>
            <Text style={styles.handle}>{user.handle}</Text>
          </View>

          {/* Status + Tier badges */}
          <View style={styles.badgesRow}>
            <TouchableOpacity
              onPress={cycleStatus}
              style={[styles.statusBadge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.color + '40' }]}
              activeOpacity={0.8}
            >
              <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
              <Text style={styles.statusIcon}>{statusCfg.icon}</Text>
              <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </TouchableOpacity>
            <PremiumBadge tier={user.tier} />
          </View>

          {/* Smart Bio */}
          <TouchableOpacity onPress={() => setBioExpanded(e => !e)} style={styles.bioWrap} activeOpacity={0.85}>
            <SmartBio bio={user.bio} keywords={user.bioKeywords} />
            {!bioExpanded && (
              <Text style={styles.bioReadMore}>Read more</Text>
            )}
          </TouchableOpacity>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <LinearGradient colors={['#6366F1', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followGrad}>
              <TouchableOpacity style={styles.followInner} activeOpacity={0.85}>
                <Text style={styles.followText}>Follow</Text>
              </TouchableOpacity>
            </LinearGradient>
            <TouchableOpacity style={styles.msgBtn} activeOpacity={0.8}>
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
              <Text style={styles.msgBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreBtn} activeOpacity={0.8}>
              <Ionicons name="bookmark-outline" size={17} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── CONTENT SECTIONS ── */}
        <View style={styles.sections}>

          {/* Member Identity Card */}
          <MemberCard tier={user.tier} joinDate={user.joinDate} />

          {/* Stats */}
          <GlassCard style={styles.statsCard}>
            <StatItem label="Posts" value={user.stats.posts} />
            <View style={styles.statDivider} />
            <StatItem label="Followers" value={user.stats.followers} />
            <View style={styles.statDivider} />
            <StatItem label="Following" value={user.stats.following} />
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>👀 {user.stats.visits}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
          </GlassCard>

          {/* Stories */}
          <View>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>Stories</Text>
              <TouchableOpacity><Text style={styles.rowAction}>See all</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.storiesRow}>
                {stories.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.storyItem}
                    activeOpacity={0.85}
                    disabled={mediaBusy}
                    onPress={() => {
                      if (s.isAdd) {
                        void pickStoryMedia();
                      }
                    }}
                  >
                    <LinearGradient colors={s.gradient as any} style={styles.storyRing}>
                      <View style={styles.storyInner}>
                        {s.isAdd ? (
                          <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.storyAddBtn}>
                            <Ionicons name="add" size={18} color="white" />
                          </LinearGradient>
                        ) : (
                          <Image source={{ uri: s.avatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        )}
                      </View>
                    </LinearGradient>
                    <Text style={styles.storyLabel}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Inner Circle CTA */}
          <TouchableOpacity activeOpacity={0.9}>
            <LinearGradient
              colors={['rgba(99,102,241,0.22)', 'rgba(6,182,212,0.1)', 'rgba(139,92,246,0.15)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.innerCircleCard}
            >
              <View style={styles.innerCircleLeft}>
                <View style={styles.innerCircleLockBox}>
                  <Text style={{ fontSize: 22 }}>🔒</Text>
                </View>
                <View>
                  <Text style={styles.innerCircleTitle}>Inner Circle Content</Text>
                  <Text style={styles.innerCircleSub}>3 posts locked for IC members</Text>
                </View>
              </View>
              <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.unlockBtn}>
                <Text style={styles.unlockBtnText}>Unlock</Text>
              </LinearGradient>
            </LinearGradient>
          </TouchableOpacity>

          {/* Profile Vibe Music */}
          <View>
            <Text style={styles.sectionLabel}>Profile Vibe</Text>
            <MiniMusicBar title={user.music.title} artist={user.music.artist} progress={user.music.progress} />
          </View>

          {/* Mood System */}
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Profile Mood</Text>
            <MoodSelector mood={mood} onChange={setMood} />
          </GlassCard>

          {/* First Impression Panel */}
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>First Impression</Text>
            <View style={styles.tagsRow}>
              {IMPRESSION_TAGS.map(t => (
                <LinearGradient
                  key={t.label}
                  colors={['rgba(99,102,241,0.18)', 'rgba(139,92,246,0.1)']}
                  style={styles.impressionTag}
                >
                  <Text style={styles.impressionTagIcon}>{t.icon}</Text>
                  <Text style={styles.impressionTagLabel}>{t.label}</Text>
                </LinearGradient>
              ))}
            </View>
          </GlassCard>

          {/* Theme Switcher */}
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Profile Theme</Text>
            <View style={styles.themesRow}>
              {THEMES.map(t => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTheme(t.id)}
                  style={[styles.themeChip, theme === t.id && { borderColor: t.color, backgroundColor: t.color + '18' }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.themeColorDot, { backgroundColor: t.color }]} />
                  <Text style={[styles.themeChipLabel, theme === t.id && { color: t.color }]}>{t.label}</Text>
                  {theme === t.id && <Ionicons name="checkmark" size={12} color={t.color} />}
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>

          {/* Interests */}
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Interests</Text>
            <View style={styles.tagsRow}>
              {user.interests.map(interest => (
                <View key={interest} style={styles.interestTag}>
                  <Text style={styles.interestTagText}>{interest}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {/* Identity Tags */}
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Digital Identity</Text>
            <View style={styles.tagsRow}>
              {user.identityTags.map(tag => (
                <View key={tag} style={styles.identityTag}>
                  <Text style={styles.identityTagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {/* Private Mode Controls */}
          <GlassCard style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="lock-closed" size={14} color={COLORS.primary} />
              <Text style={styles.cardTitle}>Private Mode</Text>
            </View>
            <View style={styles.privacyList}>
              <PrivacyToggle
                label="View Profile"
                icon="eye-outline"
                on={privacy.viewProfile}
                onToggle={() => setPrivacy(p => ({ ...p, viewProfile: !p.viewProfile }))}
              />
              <PrivacyToggle
                label="View Posts"
                icon="images-outline"
                on={privacy.viewPosts}
                onToggle={() => setPrivacy(p => ({ ...p, viewPosts: !p.viewPosts }))}
              />
              <PrivacyToggle
                label="Message Me"
                icon="chatbubble-outline"
                on={privacy.message}
                onToggle={() => setPrivacy(p => ({ ...p, message: !p.message }))}
              />
            </View>
          </GlassCard>

          {/* Posts Grid */}
          <View>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>Posts</Text>
              <TouchableOpacity style={styles.gridToggleBtn} onPress={pickPostMedia} disabled={mediaBusy}>
                <Ionicons name={mediaBusy ? 'cloud-upload-outline' : 'add'} size={17} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.postsGrid}>
              <View style={styles.postsCol}>
                {leftPosts.map(p => <PostCard key={p.id} post={p} />)}
              </View>
              <View style={styles.postsCol}>
                {rightPosts.map(p => <PostCard key={p.id} post={p} />)}
              </View>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  ambientGlow: { position: 'absolute', top: -100, left: -100, width: 400, height: 400, borderRadius: 200, opacity: 0.14 },
  ambientGlow2: { position: 'absolute', top: 300, right: -120, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(6,182,212,0.07)' },

  // Sticky header
  stickyHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 },
  stickyHeaderBg: { paddingBottom: 10 },
  stickyHeaderContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.md, paddingTop: 8 },
  stickyName: { fontSize: FONTS.md, fontWeight: FONTS.semibold, color: COLORS.text },
  stickyActions: { flexDirection: 'row', gap: 8 },
  stickyBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  // Top bar
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  topBarBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  topBarRight: { flexDirection: 'row', gap: 8 },

  // Hero
  hero: { alignItems: 'center', paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xl, gap: 14 },
  avatarSection: { position: 'relative' },
  verifiedBadge: { position: 'absolute', bottom: 4, right: 4 },
  verifiedGrad: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.bg },
  verifiedIcon: { fontSize: 11, color: COLORS.white },
  nameBlock: { alignItems: 'center', gap: 4 },
  displayName: { fontSize: FONTS.xxl, fontWeight: FONTS.black, color: COLORS.text, letterSpacing: -0.8 },
  handle: { fontSize: FONTS.base, color: COLORS.textMuted, letterSpacing: 0.2 },

  // Status badge
  badgesRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusIcon: { fontSize: 13 },
  statusLabel: { fontSize: FONTS.sm, fontWeight: FONTS.semibold },

  // Bio
  bioWrap: { paddingHorizontal: SPACE.sm },
  bioText: { fontSize: FONTS.base, color: COLORS.textSub, textAlign: 'center', lineHeight: 24, letterSpacing: 0.1 },
  bioKeyword: { color: COLORS.primaryLight, fontWeight: FONTS.semibold },
  bioReadMore: { fontSize: FONTS.sm, color: COLORS.primary, textAlign: 'center', marginTop: 4, fontWeight: FONTS.medium },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  followGrad: { flex: 1, borderRadius: RADIUS.full, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  followInner: { paddingVertical: 13, alignItems: 'center' },
  followText: { fontSize: FONTS.base, fontWeight: FONTS.bold, color: COLORS.white, letterSpacing: 0.3 },
  msgBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 13, paddingHorizontal: 18, borderRadius: RADIUS.full, backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)' },
  msgBtnText: { fontSize: FONTS.sm, fontWeight: FONTS.semibold, color: COLORS.primary },
  moreBtn: { width: 46, height: 46, borderRadius: RADIUS.full, backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  // Sections
  sections: { paddingHorizontal: SPACE.md, gap: 16 },

  // Member card
  memberCard: { borderRadius: RADIUS.xl, padding: SPACE.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' },
  memberCardLeft: { gap: 3 },
  memberCardLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: FONTS.semibold },
  memberCardTier: { fontSize: FONTS.xl, fontWeight: FONTS.black, color: COLORS.text, letterSpacing: -0.5 },
  memberCardSince: { fontSize: FONTS.xs, color: COLORS.textMuted },
  memberCardRight: { alignItems: 'flex-end', gap: 6 },
  memberCardLogo: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  memberCardLogoText: { fontSize: FONTS.lg, fontWeight: FONTS.black, color: COLORS.white },
  memberCardPrice: { fontSize: FONTS.xs, color: COLORS.textMuted },

  // Stats
  statsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: SPACE.md, paddingHorizontal: SPACE.sm },
  statItem: { alignItems: 'center', flex: 1, paddingVertical: 4 },
  statValue: { fontSize: FONTS.lg, fontWeight: FONTS.bold, color: COLORS.text, letterSpacing: -0.5 },
  statLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

  // Stories
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  rowTitle: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.text },
  rowAction: { fontSize: FONTS.sm, color: COLORS.primary, fontWeight: FONTS.medium },
  storiesRow: { flexDirection: 'row', gap: 14, paddingRight: SPACE.md },
  storyItem: { alignItems: 'center', gap: 6 },
  storyRing: { width: 66, height: 66, borderRadius: 33, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  storyInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.bgMid, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  storyAddBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  storyLabel: { fontSize: FONTS.xs, color: COLORS.textSub, fontWeight: FONTS.medium },

  // Inner circle
  innerCircleCard: { borderRadius: RADIUS.xl, padding: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' },
  innerCircleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  innerCircleLockBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(99,102,241,0.15)', alignItems: 'center', justifyContent: 'center' },
  innerCircleTitle: { fontSize: FONTS.base, fontWeight: FONTS.semibold, color: COLORS.text },
  innerCircleSub: { fontSize: FONTS.xs, color: COLORS.textMuted, marginTop: 2 },
  unlockBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.full },
  unlockBtnText: { fontSize: FONTS.sm, fontWeight: FONTS.bold, color: COLORS.white },

  // Section label
  sectionLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: FONTS.semibold, marginBottom: 10 },

  // Cards
  card: { padding: SPACE.md, gap: 12 },
  cardTitle: { fontSize: FONTS.sm, color: COLORS.textMuted, letterSpacing: 1, textTransform: 'uppercase', fontWeight: FONTS.semibold },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Mood
  moodRow: { flexDirection: 'row', gap: 8 },
  moodBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, gap: 5 },
  moodIcon: { fontSize: 20 },
  moodLabel: { fontSize: FONTS.xs, color: COLORS.textMuted, fontWeight: FONTS.semibold, letterSpacing: 0.3 },

  // Impression tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  impressionTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' },
  impressionTagIcon: { fontSize: 13 },
  impressionTagLabel: { fontSize: FONTS.sm, color: COLORS.text, fontWeight: FONTS.medium },

  // Themes
  themesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border },
  themeColorDot: { width: 9, height: 9, borderRadius: 5 },
  themeChipLabel: { fontSize: FONTS.sm, color: COLORS.textMuted, fontWeight: FONTS.medium },

  // Interests
  interestTag: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.bgGlass, borderWidth: 1, borderColor: COLORS.border },
  interestTagText: { fontSize: FONTS.sm, color: COLORS.textSub, fontWeight: FONTS.medium },

  // Identity tags
  identityTag: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.primarySofter, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' },
  identityTagText: { fontSize: FONTS.sm, color: COLORS.primaryLight, fontWeight: FONTS.medium },

  // Privacy
  privacyList: { gap: 14 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacyLabel: { flex: 1, fontSize: FONTS.base, color: COLORS.textSub, fontWeight: FONTS.medium },
  trackOuter: { width: 44, height: 24, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },

  // Posts grid
  gridToggleBtn: { padding: 6, backgroundColor: COLORS.primarySofter, borderRadius: 10 },
  postsGrid: { flexDirection: 'row', gap: COL_GAP },
  postsCol: { flex: 1, gap: COL_GAP },
  postCard: { borderRadius: RADIUS.md, overflow: 'hidden', backgroundColor: COLORS.bgSurface },
  postLocked: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4 },
  postLockIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(99,102,241,0.3)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.5)', alignItems: 'center', justifyContent: 'center' },
  postLockLabel: { fontSize: FONTS.xs, color: COLORS.textSub, fontWeight: FONTS.bold, letterSpacing: 0.5 },
  postHoverOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 8 },
  postStats: { flexDirection: 'row', alignItems: 'center' },
  postStat: { fontSize: FONTS.xs, color: COLORS.white, fontWeight: FONTS.semibold, marginLeft: 3 },
});

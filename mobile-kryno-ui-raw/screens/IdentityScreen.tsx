import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACING } from '../lib/theme';
import GlassCard from '../components/GlassCard';

const EFFECTS = [
  { id: 'aurora', label: 'Aurora', description: 'Soft northern lights', colors: ['#6366F1', '#06B6D4'], active: true },
  { id: 'neon_pulse', label: 'Neon Pulse', description: 'Pulsing neon outline', colors: ['#EC4899', '#8B5CF6'], active: false },
  { id: 'starfield', label: 'Starfield', description: 'Floating particles', colors: ['#F59E0B', '#EF4444'], active: false },
  { id: 'crystal', label: 'Crystal', description: 'Glass refraction', colors: ['#06B6D4', '#10B981'], active: false },
];

const AURA_STYLES = [
  { id: 'gradient', label: 'Gradient', icon: '◉' },
  { id: 'pulse', label: 'Pulse', icon: '◎' },
  { id: 'spark', label: 'Spark', icon: '✦' },
  { id: 'smoke', label: 'Smoke', icon: '◌' },
];

function EffectCard({ effect, onToggle }: { effect: typeof EFFECTS[0]; onToggle: () => void }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.85}>
      <LinearGradient
        colors={effect.active
          ? [effect.colors[0] + '30', effect.colors[1] + '15']
          : ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
        style={[
          styles.effectCard,
          effect.active && { borderColor: effect.colors[0] + '60' },
        ]}
      >
        <LinearGradient colors={effect.colors as any} style={styles.effectDot} />
        <View style={styles.effectInfo}>
          <Text style={styles.effectLabel}>{effect.label}</Text>
          <Text style={styles.effectDesc}>{effect.description}</Text>
        </View>
        <View style={[styles.effectToggle, effect.active && styles.effectToggleOn]}>
          {effect.active && <Ionicons name="checkmark" size={14} color="white" />}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function IdentityScreen() {
  const [effects, setEffects] = useState(EFFECTS);
  const [activeAura, setActiveAura] = useState('gradient');

  const toggleEffect = (id: string) => {
    setEffects(prev => prev.map(e => ({ ...e, active: e.id === id ? !e.active : e.active })));
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Identity</Text>
            <Text style={styles.subtitle}>Shape your digital presence</Text>
          </View>

          <View style={styles.content}>
            {/* Premium Banner */}
            <LinearGradient
              colors={['rgba(99,102,241,0.3)', 'rgba(139,92,246,0.2)', 'rgba(6,182,212,0.15)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.premiumBanner}
            >
              <View style={styles.premiumBannerLeft}>
                <Text style={styles.premiumBannerTitle}>Profile Effects</Text>
                <Text style={styles.premiumBannerSub}>Premium · ₹200/month</Text>
              </View>
              <View style={styles.premiumBannerBadge}>
                <Text style={styles.premiumBannerBadgeText}>✦ Active</Text>
              </View>
            </LinearGradient>

            {/* Aura Style */}
            <GlassCard style={styles.section}>
              <Text style={styles.sectionTitle}>Aura Style</Text>
              <View style={styles.auraRow}>
                {AURA_STYLES.map(a => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => setActiveAura(a.id)}
                    style={[
                      styles.auraBtn,
                      activeAura === a.id && styles.auraBtnActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.auraIcon, activeAura === a.id && { color: COLORS.primary }]}>{a.icon}</Text>
                    <Text style={[styles.auraLabel, activeAura === a.id && { color: COLORS.primary }]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </GlassCard>

            {/* Background Effects */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Animated Backgrounds</Text>
              <View style={styles.effectsList}>
                {effects.map(effect => (
                  <EffectCard key={effect.id} effect={effect} onToggle={() => toggleEffect(effect.id)} />
                ))}
              </View>
            </View>

            {/* Dynamic Lighting */}
            <GlassCard style={styles.section}>
              <Text style={styles.sectionTitle}>Dynamic Lighting</Text>
              <Text style={styles.sectionDesc}>Lighting adapts to your mood and activity in real-time.</Text>
              <View style={styles.lightingGrid}>
                {[
                  { label: 'Depth Shadows', on: true },
                  { label: 'Ambient Glow', on: true },
                  { label: 'Reactive Pulse', on: false },
                  { label: 'Parallax Layers', on: true },
                ].map(item => (
                  <View key={item.label} style={styles.lightingItem}>
                    <View style={[styles.lightingDot, { backgroundColor: item.on ? COLORS.primary : 'rgba(255,255,255,0.2)' }]} />
                    <Text style={styles.lightingLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            {/* Upgrade CTA */}
            <TouchableOpacity activeOpacity={0.9}>
              <LinearGradient
                colors={['#6366F1', '#8B5CF6', '#EC4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeCta}
              >
                <View style={styles.upgradeLeft}>
                  <Text style={styles.upgradeTitle}>Unlock All Effects</Text>
                  <Text style={styles.upgradeSub}>₹200/month · Cancel anytime</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={28} color="white" />
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ height: 80 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.md, gap: 4 },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.bold, color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted },
  content: { paddingHorizontal: SPACING.md, gap: 16 },
  premiumBanner: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
  },
  premiumBannerLeft: { gap: 3 },
  premiumBannerTitle: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.text },
  premiumBannerSub: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  premiumBannerBadge: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)',
  },
  premiumBannerBadgeText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: FONTS.weights.bold },
  section: { gap: 14, padding: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text },
  sectionDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, lineHeight: 20 },
  auraRow: { flexDirection: 'row', gap: 8 },
  auraBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 6,
  },
  auraBtnActive: { backgroundColor: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.4)' },
  auraIcon: { fontSize: 22, color: COLORS.textMuted },
  auraLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontWeight: FONTS.weights.medium },
  effectsList: { gap: 10 },
  effectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: SPACING.md, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  effectDot: { width: 40, height: 40, borderRadius: 12 },
  effectInfo: { flex: 1 },
  effectLabel: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text },
  effectDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  effectToggle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  effectToggleOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  lightingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  lightingItem: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '47%' },
  lightingDot: { width: 8, height: 8, borderRadius: 4 },
  lightingLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSub },
  upgradeCta: {
    borderRadius: RADIUS.xl, padding: SPACING.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  upgradeLeft: { gap: 3 },
  upgradeTitle: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.white },
  upgradeSub: { fontSize: FONTS.sizes.xs, color: 'rgba(255,255,255,0.7)' },
});

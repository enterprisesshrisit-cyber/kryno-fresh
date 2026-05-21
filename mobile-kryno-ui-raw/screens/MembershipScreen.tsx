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

const TIERS = [
  {
    id: 'basic',
    name: 'Basic',
    price: '₹99',
    period: 'one-time',
    tagline: 'Your entry into Kryno',
    icon: '◆',
    colors: ['#6366F1', '#8B5CF6'] as string[],
    features: [
      'Verified Kryno profile',
      'Custom handle',
      'Basic profile themes',
      'Standard aura',
      'Public posts',
      'Follow & connect',
    ],
    locked: [],
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '₹200',
    period: '/month',
    tagline: 'The full Kryno experience',
    icon: '◈',
    colors: ['#F59E0B', '#EF4444'] as string[],
    features: [
      'Everything in Basic',
      'All premium themes',
      'Custom aura styles',
      'Profile vibe music',
      'AI Smart Bio',
      'Profile effects',
    ],
    locked: [],
    popular: true,
  },
  {
    id: 'inner',
    name: 'Inner Circle',
    price: '₹200',
    period: '/month',
    tagline: 'Exclusive. Private. Yours.',
    icon: '✦',
    colors: ['#06B6D4', '#6366F1', '#EC4899'] as string[],
    features: [
      'Everything in Elite',
      'Inner Circle content lock',
      'Private mode controls',
      'Animated backgrounds',
      'Mood system',
      'First impression panel',
      'Priority in Explore',
    ],
    locked: [],
  },
];

function TierCard({ tier, active }: { tier: typeof TIERS[0]; active: boolean }) {
  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.tierCardWrapper}>
      <LinearGradient
        colors={active
          ? [tier.colors[0] + '25', tier.colors[tier.colors.length - 1] + '15']
          : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.02)']}
        style={[
          styles.tierCard,
          active && { borderColor: tier.colors[0] + '60' },
        ]}
      >
        {(tier as any).popular && (
          <LinearGradient
            colors={tier.colors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.popularBadge}
          >
            <Text style={styles.popularText}>Most Popular</Text>
          </LinearGradient>
        )}

        <View style={styles.tierTop}>
          <LinearGradient colors={tier.colors as any} style={styles.tierIcon}>
            <Text style={styles.tierIconText}>{tier.icon}</Text>
          </LinearGradient>
          <View style={styles.tierInfo}>
            <Text style={styles.tierName}>{tier.name}</Text>
            <Text style={styles.tierTagline}>{tier.tagline}</Text>
          </View>
          <View style={styles.tierPriceBlock}>
            <Text style={[styles.tierPrice, { color: tier.colors[0] }]}>{tier.price}</Text>
            <Text style={styles.tierPeriod}>{tier.period}</Text>
          </View>
        </View>

        <View style={styles.featuresList}>
          {tier.features.map(f => (
            <View key={f} style={styles.featureRow}>
              <View style={[styles.featureCheck, { backgroundColor: tier.colors[0] + '25' }]}>
                <Ionicons name="checkmark" size={11} color={tier.colors[0]} />
              </View>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity activeOpacity={0.85}>
          <LinearGradient
            colors={tier.colors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaBtn}
          >
            <Text style={styles.ctaBtnText}>
              {active ? 'Current Plan' : `Get ${tier.name}`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function MembershipScreen() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>✦ Kryno Membership</Text>
            </View>
            <Text style={styles.title}>Choose Your{`\n`}Identity Tier</Text>
            <Text style={styles.subtitle}>
              Not a subscription for content.{`\n`}A subscription for who you are.
            </Text>
          </View>

          <View style={styles.cards}>
            {TIERS.map((tier, i) => (
              <TierCard key={tier.id} tier={tier} active={i === 2} />
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>All plans include a 7-day free trial</Text>
            <Text style={styles.footerSub}>Cancel anytime · No hidden fees · Premium support</Text>
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    gap: 12,
    alignItems: 'center',
  },
  headerBadge: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
  },
  headerBadgeText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: FONTS.weights.bold, letterSpacing: 1 },
  title: {
    fontSize: FONTS.sizes.xxl + 4,
    fontWeight: FONTS.weights.black,
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -1,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  cards: { paddingHorizontal: SPACING.md, gap: 14 },
  tierCardWrapper: {},
  tierCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 16,
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0, right: 0,
    paddingHorizontal: 14, paddingVertical: 6,
    borderBottomLeftRadius: RADIUS.md,
  },
  popularText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontWeight: FONTS.weights.bold },
  tierTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tierIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tierIconText: { fontSize: 20, color: COLORS.white },
  tierInfo: { flex: 1 },
  tierName: { fontSize: FONTS.sizes.md, fontWeight: FONTS.weights.bold, color: COLORS.text },
  tierTagline: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 2 },
  tierPriceBlock: { alignItems: 'flex-end' },
  tierPrice: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.black },
  tierPeriod: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  featuresList: { gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  featureText: { fontSize: FONTS.sizes.sm, color: COLORS.textSub, flex: 1 },
  ctaBtn: { borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center' },
  ctaBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.white },
  footer: { paddingTop: SPACING.xl, alignItems: 'center', gap: 6 },
  footerText: { fontSize: FONTS.sizes.sm, color: COLORS.textSub, fontWeight: FONTS.weights.medium },
  footerSub: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
});

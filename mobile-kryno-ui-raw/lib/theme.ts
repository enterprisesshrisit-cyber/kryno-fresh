// ─── KRYNO PREMIUM DESIGN SYSTEM ───────────────────────────────────────────

export const COLORS = {
  // Backgrounds
  bg: '#05070F',
  bgDeep: '#020408',
  bgMid: '#080B16',
  bgSurface: '#0C1020',
  bgCard: 'rgba(255,255,255,0.035)',
  bgGlass: 'rgba(255,255,255,0.055)',
  bgGlassMid: 'rgba(255,255,255,0.08)',
  bgGlassHigh: 'rgba(255,255,255,0.11)',

  // Borders
  border: 'rgba(255,255,255,0.07)',
  borderMid: 'rgba(255,255,255,0.11)',
  borderHigh: 'rgba(255,255,255,0.18)',

  // Primary — Indigo
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryGlow: 'rgba(99,102,241,0.35)',
  primarySoft: 'rgba(99,102,241,0.12)',
  primarySofter: 'rgba(99,102,241,0.07)',

  // Accent — Violet
  accent: '#8B5CF6',
  accentGlow: 'rgba(139,92,246,0.3)',

  // Cyan
  cyan: '#06B6D4',
  cyanGlow: 'rgba(6,182,212,0.25)',
  cyanSoft: 'rgba(6,182,212,0.1)',

  // Pink
  pink: '#EC4899',
  pinkGlow: 'rgba(236,72,153,0.25)',

  // Gold
  gold: '#F59E0B',
  goldGlow: 'rgba(245,158,11,0.25)',

  // Text
  text: '#F1F5F9',
  textSub: 'rgba(241,245,249,0.65)',
  textMuted: 'rgba(241,245,249,0.38)',
  textGhost: 'rgba(241,245,249,0.2)',

  // Utility
  white: '#FFFFFF',
  success: '#10B981',
  successSoft: 'rgba(16,185,129,0.15)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.15)',
  error: '#EF4444',
};

export const GRADIENTS = {
  // Core aura
  aura: ['#6366F1', '#8B5CF6', '#EC4899'] as string[],
  auraAlt: ['#06B6D4', '#6366F1', '#8B5CF6'] as string[],
  auraCool: ['#06B6D4', '#8B5CF6'] as string[],

  // Tiers
  basic: ['#6366F1', '#8B5CF6'] as string[],
  elite: ['#F59E0B', '#EF4444'] as string[],
  innerCircle: ['#06B6D4', '#6366F1', '#EC4899'] as string[],

  // UI
  cardSubtle: ['rgba(99,102,241,0.1)', 'rgba(139,92,246,0.05)'] as string[],
  cardGold: ['rgba(245,158,11,0.15)', 'rgba(245,158,11,0.04)'] as string[],
  overlay: ['transparent', 'rgba(5,7,15,0.85)'] as string[],
  overlayFull: ['rgba(5,7,15,0.0)', 'rgba(5,7,15,0.96)'] as string[],
  bgAmbient: ['#05070F', '#080B16', '#05070F'] as string[],

  // Moods
  moodChill: ['rgba(139,92,246,0.2)', 'rgba(99,102,241,0.08)'] as string[],
  moodSocial: ['rgba(239,68,68,0.2)', 'rgba(236,72,153,0.08)'] as string[],
  moodFocus: ['rgba(6,182,212,0.2)', 'rgba(99,102,241,0.08)'] as string[],
};

export const FONTS = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  hero: 36,

  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    xxl: 30,
    hero: 36,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
};

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const SPACING = SPACE;

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  full: 999,
};

export const SHADOW = {
  glow: (color = '#6366F1', radius = 20, opacity = 0.45) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation: 12,
  }),
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
};

export type MoodType = 'chill' | 'social' | 'focus';
export type TierType = 'Basic' | 'Elite' | 'Inner Circle';
export type StatusType = 'active' | 'focus' | 'private';
export type ThemeType = 'dark_glass' | 'cyber_neon' | 'smooth_aura';

export const MOOD = {
  chill: { label: 'Chill', icon: '🌙', color: '#8B5CF6', glow: 'rgba(139,92,246,0.18)', gradient: ['rgba(139,92,246,0.22)', 'rgba(99,102,241,0.06)'] as string[] },
  social: { label: 'Social', icon: '🔥', color: '#EF4444', glow: 'rgba(239,68,68,0.18)', gradient: ['rgba(239,68,68,0.22)', 'rgba(236,72,153,0.06)'] as string[] },
  focus: { label: 'Focus', icon: '🧠', color: '#06B6D4', glow: 'rgba(6,182,212,0.18)', gradient: ['rgba(6,182,212,0.22)', 'rgba(99,102,241,0.06)'] as string[] },
};

export const TIER = {
  'Basic': { icon: '◆', colors: ['#6366F1', '#8B5CF6'] as string[], color: '#6366F1' },
  'Elite': { icon: '◈', colors: ['#F59E0B', '#EF4444'] as string[], color: '#F59E0B' },
  'Inner Circle': { icon: '✦', colors: ['#06B6D4', '#6366F1', '#EC4899'] as string[], color: '#06B6D4' },
};

export const STATUS = {
  active: { label: 'Active Now', icon: '🔥', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  focus: { label: 'Focus Mode', icon: '🧠', color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
  private: { label: 'Private Mode', icon: '🌙', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
};

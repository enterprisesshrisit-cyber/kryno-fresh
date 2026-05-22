import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, FONTS, RADIUS, SPACING } from '../lib/theme';

type ExploreMember = {
  id: string;
  name: string;
  handle: string;
};

const FEATURED_MEMBERS: ExploreMember[] = [];

export default function ExploreScreen() {
  const [search, setSearch] = useState('');
  const members = FEATURED_MEMBERS.filter((member) => search === '' || member.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Explore</Text>
          <Text style={styles.subtitle}>Discover real Kryno members</Text>
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

        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.memberRow}>
              <Text style={styles.memberName}>{item.name}</Text>
              <Text style={styles.memberHandle}>{item.handle}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyMembers}>
              <Ionicons name="people-outline" size={32} color={COLORS.primary} />
              <Text style={styles.emptyMembersTitle}>No members yet</Text>
              <Text style={styles.emptyMembersCopy}>Real Kryno member suggestions will appear here.</Text>
            </View>
          }
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
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.bold, color: COLORS.text },
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
    gap: 10
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  list: { paddingHorizontal: SPACING.md, paddingBottom: 100 },
  memberRow: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    padding: SPACING.md,
    marginBottom: 12
  },
  memberName: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold, color: COLORS.text },
  memberHandle: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, marginTop: 3 },
  emptyMembers: {
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    alignItems: 'center',
    gap: 8
  },
  emptyMembersTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text },
  emptyMembersCopy: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, textAlign: 'center' }
});

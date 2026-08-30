import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FAQ_ITEMS, faqCategories, searchFaq } from '../content/faq';
import { colors } from '../theme/colors';

export function HelpDesk() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => searchFaq(query), [query]);
  const browsing = !query.trim();

  const grouped = useMemo(() => {
    if (!browsing) return null;
    const cats = faqCategories();
    return cats.map((cat) => ({
      cat,
      items: FAQ_ITEMS.filter((i) => i.category === cat),
    }));
  }, [browsing]);

  function onPick(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  function renderItem(item: (typeof FAQ_ITEMS)[number]) {
    const open = openId === item.id || !browsing;
    return (
      <Pressable
        key={item.id}
        style={[styles.item, open && styles.itemOpen]}
        onPress={() => onPick(item.id)}
      >
        <Text style={styles.question}>{item.question}</Text>
        {open ? <Text style={styles.answer}>{item.answer}</Text> : null}
        {browsing && !open ? (
          <Text style={styles.tapHint}>Tap for answer</Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>
        Ask in plain English — we match your words to common questions and show answers
        instantly. No AI, just built-in help.
      </Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setOpenId(null);
        }}
        placeholder="e.g. How do I log a multi? Why no surebets?"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {query.trim() ? (
        <Text style={styles.meta}>
          {results.length
            ? `${results.length} answer${results.length === 1 ? '' : 's'} found`
            : 'No match — try fewer words like “settle”, “arb”, or “odds”'}
        </Text>
      ) : (
        <Text style={styles.meta}>Popular topics below · or type to search</Text>
      )}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {browsing && grouped
          ? grouped.map(({ cat, items }) => (
              <View key={cat} style={styles.section}>
                <Text style={styles.sectionTitle}>{cat}</Text>
                {items.map(renderItem)}
              </View>
            ))
          : results.map(renderItem)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
  },
  meta: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  list: { flex: 1, marginTop: 8 },
  listContent: { paddingBottom: 32 },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  item: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  itemOpen: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  question: { color: colors.ink, fontWeight: '700', fontSize: 15, lineHeight: 21 },
  answer: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  tapHint: { color: colors.accent, fontSize: 11, fontWeight: '600', marginTop: 6 },
});

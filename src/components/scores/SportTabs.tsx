import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SportDef, SportId } from '../../sports';
import { C } from './ui';

/** Big sport chips across the top of Scores / Home */
export function SportTabs({ sports, value, onChange }: { sports: SportDef[]; value: SportId; onChange: (s: SportId) => void }) {
  return (
    <View style={st.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.inner}>
        {sports.map(sp => {
          const active = sp.id === value;
          return (
            <TouchableOpacity key={sp.id} style={[st.btn, active && st.btnActive]} onPress={() => onChange(sp.id)}>
              <Text style={st.emoji}>{sp.emoji}</Text>
              <Text style={[st.label, active && st.labelActive]}>{sp.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { backgroundColor: C.bg },
  inner: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.card },
  btnActive: { backgroundColor: C.accent },
  emoji: { fontSize: 15 },
  label: { fontSize: 14, fontWeight: '700', color: C.faint },
  labelActive: { color: '#fff' },
});

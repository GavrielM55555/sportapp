import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Image } from 'react-native';
import { GroupMember } from '../../types';
import { C } from '../scores/ui';

// Shared pieces for the prediction screens.

export function ScoringInfo({ lines }: { lines: string[] }) {
  return (
    <View style={p.info}>
      {lines.map(l => <Text key={l} style={p.infoText}>📊 {l}</Text>)}
    </View>
  );
}

export function SectionTitle({ children, color }: { children: React.ReactNode; color?: string }) {
  return <Text style={[p.sectionTitle, color ? { color } : null]}>{children}</Text>;
}

export function PickButton({ label, done, onPress, disabled }: { label: string; done?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[p.pickBtn, done && p.pickBtnDone, disabled && { opacity: 0.4 }]} onPress={onPress} disabled={disabled}>
      <Text style={p.pickBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Every member's pick, revealed once picks lock */
export function MembersReveal({ members, pickFor }: {
  members: GroupMember[];
  pickFor: (uid: string) => { label: string; correct?: boolean; points?: number } | null;
}) {
  return (
    <View style={p.reveal}>
      {members.map(m => {
        const pick = pickFor(m.uid);
        return (
          <View key={m.uid} style={p.revealRow}>
            <Text style={p.revealName} numberOfLines={1}>{m.displayName}</Text>
            {pick ? (
              <>
                <View style={[p.revealPick, pick.correct === true ? p.correct : pick.correct === false ? p.wrong : p.pending]}>
                  <Text style={p.revealPickText} numberOfLines={1}>{pick.label}</Text>
                </View>
                <Text style={p.revealPts}>{pick.points !== undefined ? `+${pick.points}` : '–'}</Text>
              </>
            ) : <Text style={p.noPick}>No pick</Text>}
          </View>
        );
      })}
    </View>
  );
}

export interface Option { id: string; label: string; sub?: string; image?: string; swatch?: string }

/** Full-screen list to choose one option (teams, drivers…) */
export function OptionPicker({ visible, title, subtitle, options, disabledIds = [], onPick, onClose }: {
  visible: boolean; title: string; subtitle?: string; options: Option[];
  disabledIds?: string[]; onPick: (o: Option) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={p.overlay}>
        <View style={p.sheet}>
          <Text style={p.sheetTitle}>{title}</Text>
          {subtitle ? <Text style={p.sheetSub}>{subtitle}</Text> : null}
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {options.map(o => {
              const disabled = disabledIds.includes(o.id);
              return (
                <TouchableOpacity key={o.id} style={[p.option, disabled && { opacity: 0.3 }]} disabled={disabled} onPress={() => onPick(o)}>
                  {o.swatch ? <View style={[p.swatch, { backgroundColor: o.swatch }]} /> : null}
                  {o.image ? <Image source={{ uri: o.image }} style={p.optionImg} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={p.optionLabel}>{o.label}</Text>
                    {o.sub ? <Text style={p.optionSub}>{o.sub}</Text> : null}
                  </View>
                  <Text style={p.optionArrow}>›</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={p.cancel} onPress={onClose}><Text style={p.cancelText}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** "Pick the champion" card used by every sport */
export function ChampionCard({ title, lockText, locked, myPickLabel, members, pickFor, onOpen, saving }: {
  title: string; lockText: string; locked: boolean; myPickLabel?: string;
  members: GroupMember[]; pickFor: (uid: string) => { label: string; correct?: boolean; points?: number } | null;
  onOpen: () => void; saving?: boolean;
}) {
  return (
    <View style={p.bonus}>
      <Text style={p.bonusTitle}>{title}</Text>
      <Text style={p.bonusSub}>{lockText}</Text>
      {locked
        ? <MembersReveal members={members} pickFor={pickFor} />
        : <PickButton label={saving ? 'Saving…' : myPickLabel ? `My pick: ${myPickLabel} · Change` : 'Make your pick'} done={!!myPickLabel} onPress={onOpen} disabled={saving} />}
    </View>
  );
}

export const p = StyleSheet.create({
  info: { backgroundColor: '#1a2634', marginHorizontal: 12, marginVertical: 8, borderRadius: 10, padding: 10, gap: 2 },
  infoText: { color: C.muted, fontSize: 11 },
  sectionTitle: { color: C.text, fontSize: 14, fontWeight: '800', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },

  block: { backgroundColor: C.card, marginHorizontal: 12, marginVertical: 4, borderRadius: 12, overflow: 'hidden' },
  blockHead: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  blockTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  blockSub: { color: C.faint, fontSize: 11, marginTop: 2 },
  live: { color: C.live, fontSize: 11, fontWeight: '700', marginTop: 2 },
  final: { color: C.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  count: { color: C.faint, fontSize: 11 },

  pickBtn: { backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' },
  pickBtnDone: { backgroundColor: '#14532d' },
  pickBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  teamBtns: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  teamBtn: { flex: 1, backgroundColor: C.bg, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#374151', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  teamBtnSel: { borderColor: C.accent, backgroundColor: C.accentBg },
  teamBtnText: { color: C.muted, fontWeight: '700', fontSize: 13 },
  teamBtnTextSel: { color: C.accent },
  teamLogo: { width: 18, height: 18, resizeMode: 'contain' },

  reveal: { borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 4 },
  revealRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, gap: 8 },
  revealName: { flex: 1, color: '#d1d5db', fontSize: 13 },
  revealPick: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, maxWidth: 170 },
  revealPickText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  correct: { backgroundColor: '#14532d' },
  wrong: { backgroundColor: '#450a0a' },
  pending: { backgroundColor: '#1e2d3d' },
  revealPts: { width: 36, textAlign: 'right', color: C.accent, fontSize: 12, fontWeight: '800' },
  noPick: { color: C.dim, fontSize: 12 },

  bonus: { backgroundColor: '#1a1530', borderColor: '#8b5cf655', borderWidth: 1, marginHorizontal: 12, marginVertical: 8, borderRadius: 12, padding: 12, gap: 8 },
  bonusTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bonusSub: { color: C.muted, fontSize: 12 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sheetSub: { color: C.muted, fontSize: 12, marginTop: 4, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  optionImg: { width: 22, height: 22, resizeMode: 'contain' },
  optionLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  optionSub: { color: C.faint, fontSize: 11, marginTop: 1 },
  optionArrow: { color: C.faint, fontSize: 18 },
  swatch: { width: 4, height: 22, borderRadius: 2 },
  cancel: { alignItems: 'center', paddingTop: 14 },
  cancelText: { color: C.faint, fontSize: 15, fontWeight: '600' },
});

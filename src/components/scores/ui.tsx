import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';

// Shared building blocks for every sport's Scores view.

export const C = {
  bg: '#0f1923',
  card: '#1a2634',
  line: '#1e2d3d',
  rowAlt: '#111e2a',
  accent: '#f97316',
  accentBg: '#1f1200',
  live: '#ef4444',
  win: '#22c55e',
  text: '#fff',
  muted: '#9ca3af',
  faint: '#6b7280',
  dim: '#4b5563',
};

// ── Dates ────────────────────────────────────────────────────────────────

export function localIso(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

export interface DateChip { iso: string; label: string; dayLabel: string; isToday: boolean }

/** A week back to two weeks ahead, local dates */
export function buildDates(): DateChip[] {
  const now = new Date();
  return Array.from({ length: 22 }, (_, k) => {
    const i = k - 7;
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    return {
      iso: localIso(d),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dayLabel: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      isToday: i === 0,
    };
  });
}
export const TODAY_INDEX = 7;

export function localTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function localDayTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${localTime(iso)}`;
}

export function DateStrip({ dates, selected, onSelect }: { dates: DateChip[]; selected: number; onSelect: (i: number) => void }) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollTo({ x: TODAY_INDEX * 66 - 100, animated: false }), 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={s.dateBar}>
      <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dateBarInner}>
        {dates.map((d, i) => {
          const sel = i === selected;
          return (
            <TouchableOpacity key={d.iso} style={[s.dateChip, sel && s.dateChipSel]} onPress={() => onSelect(i)}>
              <Text style={[s.dateDayText, sel && s.dateTextSel, d.isToday && !sel && s.dateTodayText]}>{d.dayLabel}</Text>
              <Text style={[s.dateDateText, sel && s.dateTextSel]}>{d.label}</Text>
              {d.isToday && <View style={s.todayDot} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Re-run `refresh` every 60s while something is live */
export function useLiveRefresh(active: boolean, refresh: () => void) {
  const fn = useRef(refresh);
  fn.current = refresh;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => fn.current(), 60_000);
    return () => clearInterval(id);
  }, [active]);
}

// ── Chips / toggles ──────────────────────────────────────────────────────

export function ChipBar({ items, isActive, onPress }: {
  items: { key: string | number; emoji?: string; label: string }[];
  isActive: (key: string | number) => boolean;
  onPress: (key: string | number) => void;
}) {
  return (
    <View style={s.chipBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipBarInner}>
        {items.map(it => {
          const active = isActive(it.key);
          return (
            <TouchableOpacity key={it.key} style={[s.chip, active && s.chipActive]} onPress={() => onPress(it.key)}>
              {it.emoji ? <Text style={s.chipEmoji}>{it.emoji}</Text> : null}
              <Text style={[s.chipText, active && s.chipTextActive]}>{it.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function Toggle<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.toggle}>
      {options.map(o => (
        <TouchableOpacity key={o.key} style={[s.toggleBtn, value === o.key && s.toggleBtnActive]} onPress={() => onChange(o.key)}>
          <Text style={[s.toggleText, value === o.key && s.toggleTextActive]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Section header ───────────────────────────────────────────────────────

export function SectionHeader({ emoji, title, subtitle, right }: {
  emoji?: string; title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <View style={s.sectionHeader}>
      {emoji ? <Text style={s.sectionEmoji}>{emoji}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ── States ───────────────────────────────────────────────────────────────

export function Loading() {
  return <View style={s.center}><ActivityIndicator size="large" color={C.accent} /></View>;
}

export function Empty({ emoji, text, sub }: { emoji?: string; text: string; sub?: string }) {
  return (
    <View style={s.center}>
      {emoji ? <Text style={s.emptyEmoji}>{emoji}</Text> : null}
      <Text style={s.emptyText}>{text}</Text>
      {sub ? <Text style={s.emptySub}>{sub}</Text> : null}
    </View>
  );
}

export function ErrorRetry({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={s.center}>
      <Text style={s.errorText}>⚠️ {text}</Text>
      <TouchableOpacity style={s.retryBtn} onPress={onRetry}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
    </View>
  );
}

export function LiveBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={s.liveBanner}>
      <Text style={s.liveBannerText}>● {count} live · auto-refreshes every 60s</Text>
    </View>
  );
}

// ── Two-team score card (basketball, football, NFL, MLB) ────────────────

export interface CardTeam { name: string; logo?: string }

export function TwoTeamCard({ home, away, homeScore, awayScore, status, label, note, homeFirst = true }: {
  home: CardTeam; away: CardTeam;
  homeScore: number | null; awayScore: number | null;
  status: 'scheduled' | 'live' | 'final';
  label: string;          // time, minute, quarter, "FT"…
  note?: string;          // small caption under the card
  homeFirst?: boolean;    // US sports list the away team first
}) {
  const isLive = status === 'live';
  const isFinal = status === 'final';
  const hasScore = homeScore !== null && awayScore !== null;
  const homeWin = isFinal && hasScore && homeScore! > awayScore!;
  const awayWin = isFinal && hasScore && awayScore! > homeScore!;
  const rows = [
    { team: home, score: homeScore, win: homeWin },
    { team: away, score: awayScore, win: awayWin },
  ];
  if (!homeFirst) rows.reverse();
  return (
    <View style={[s.card, isLive && s.cardLive]}>
      {isLive && <View style={s.liveStripe} />}
      <View style={s.cardInner}>
        <View style={s.cardTeams}>
          {rows.map((r, i) => (
            <View key={i} style={s.teamRow}>
              {r.team.logo
                ? <Image source={{ uri: r.team.logo }} style={s.logo} />
                : <View style={[s.logo, s.logoPlaceholder]}><Text style={s.logoText}>{r.team.name[0] ?? '?'}</Text></View>}
              <Text style={[s.teamName, r.win && s.teamWinner]} numberOfLines={1}>{r.team.name}</Text>
            </View>
          ))}
        </View>
        <View style={s.status}>
          <Text style={[s.statusText, { color: isLive ? C.live : isFinal ? C.dim : C.muted }, isLive && { fontWeight: '800' }]} numberOfLines={2}>
            {isLive ? '● ' : ''}{label}
          </Text>
        </View>
        <View style={s.scores}>
          {rows.map((r, i) => hasScore
            ? <Text key={i} style={[s.score, r.win && s.scoreWinner, isLive && s.scoreLive]}>{r.score}</Text>
            : <Text key={i} style={s.scoreDash}>-</Text>)}
        </View>
      </View>
      {note ? <Text style={s.cardNote} numberOfLines={1}>{note}</Text> : null}
    </View>
  );
}

// ── Ranked list (standings, F1 results) ─────────────────────────────────

export interface TableColumn { label: string; width?: number; accent?: boolean }

export function RankedTable({ columns, rows }: {
  columns: TableColumn[];                 // after the # and name columns
  rows: { key: string; rank: number | string; name: string; image?: string; swatch?: string; values: (string | number)[] }[];
}) {
  return (
    <View>
      <View style={s.tableHeaderRow}>
        <Text style={[s.tableCell, s.tableRank]}>#</Text>
        <Text style={[s.tableCell, { flex: 1, textAlign: 'left' }]}>Name</Text>
        {columns.map(c => <Text key={c.label} style={[s.tableCell, { width: c.width ?? 30 }]}>{c.label}</Text>)}
      </View>
      {rows.map((r, i) => (
        <View key={r.key} style={[s.tableRow, i % 2 === 0 && s.tableRowAlt]}>
          <Text style={[s.tableCell, s.tableRank, s.tableData]}>{r.rank}</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {r.swatch ? <View style={[s.swatch, { backgroundColor: r.swatch }]} /> : null}
            {r.image ? <Image source={{ uri: r.image }} style={s.tableImage} /> : null}
            <Text style={s.tableName} numberOfLines={1}>{r.name}</Text>
          </View>
          {r.values.map((v, j) => (
            <Text key={j} style={[s.tableCell, s.tableData, { width: columns[j]?.width ?? 30 }, columns[j]?.accent && s.tableAccent]}>{v}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 44, marginBottom: 12 },
  emptyText: { color: C.muted, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySub: { color: C.faint, fontSize: 13, marginTop: 4, textAlign: 'center' },
  errorText: { color: C.muted, fontSize: 15, marginBottom: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: C.accent, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
  scroll: { paddingVertical: 8, paddingBottom: 40, flexGrow: 1 },

  dateBar: { borderBottomWidth: 1, borderBottomColor: C.line },
  dateBarInner: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  dateChip: { width: 62, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  dateChipSel: { backgroundColor: C.accent },
  dateDayText: { fontSize: 10, fontWeight: '700', color: C.faint, textTransform: 'uppercase', letterSpacing: 0.3 },
  dateDateText: { fontSize: 11, fontWeight: '700', color: C.muted, marginTop: 1 },
  dateTextSel: { color: '#fff' },
  dateTodayText: { color: C.accent },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent, marginTop: 2 },

  chipBar: { borderBottomWidth: 1, borderBottomColor: C.line },
  chipBarInner: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: 'transparent' },
  chipActive: { borderColor: C.accent, backgroundColor: C.accentBg },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontWeight: '600', color: C.faint },
  chipTextActive: { color: C.accent },

  toggle: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 8, padding: 2 },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  toggleBtnActive: { backgroundColor: C.accent },
  toggleText: { fontSize: 11, fontWeight: '700', color: C.faint },
  toggleTextActive: { color: '#fff' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  sectionEmoji: { fontSize: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  sectionSub: { fontSize: 11, color: C.faint },

  liveBanner: { backgroundColor: '#1a0000', paddingHorizontal: 16, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#3d0000' },
  liveBannerText: { color: C.live, fontSize: 12, fontWeight: '600' },

  card: { backgroundColor: C.card, marginHorizontal: 12, marginVertical: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  cardLive: { borderColor: '#ef444422' },
  liveStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.live },
  cardInner: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  cardTeams: { flex: 1, gap: 8 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 20, height: 20, resizeMode: 'contain' },
  logoPlaceholder: { backgroundColor: '#374151', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  teamName: { fontSize: 13, fontWeight: '500', color: C.muted, flex: 1 },
  teamWinner: { color: C.text, fontWeight: '700' },
  status: { width: 64, alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  scores: { width: 28, alignItems: 'center', gap: 8 },
  score: { fontSize: 16, fontWeight: '700', color: C.muted, textAlign: 'center' },
  scoreWinner: { color: C.text, fontWeight: '800' },
  scoreLive: { color: C.accent },
  scoreDash: { fontSize: 16, color: '#374151', textAlign: 'center' },
  cardNote: { fontSize: 10, color: C.faint, paddingHorizontal: 14, paddingBottom: 6, marginTop: -4 },

  tableHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.bg },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 },
  tableRowAlt: { backgroundColor: C.rowAlt },
  tableCell: { width: 30, textAlign: 'center', fontSize: 11, color: C.faint, fontWeight: '600' },
  tableRank: { width: 22 },
  tableData: { color: '#d1d5db' },
  tableAccent: { color: C.accent, fontWeight: '800' },
  tableImage: { width: 16, height: 16, resizeMode: 'contain' },
  tableName: { fontSize: 12, fontWeight: '600', color: C.text, flex: 1 },
  swatch: { width: 4, height: 16, borderRadius: 2 },
});

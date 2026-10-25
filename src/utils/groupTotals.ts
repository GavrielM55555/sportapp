import { collection, doc, getDocs, query, runTransaction, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { GroupMember } from '../types';

// Every collection whose docs carry { uid, groupId, pointsEarned }
export const SCORED_COLLECTIONS = [
  'predictions',
  'series_predictions',
  'football_predictions',
  'championship_picks',
  'playoff_bonus_picks',
  'playoff_r3_bonus_picks',
  'playoff_r4_bonus_picks',
  'team_predictions',   // NFL / MLB games and series
  'f1_predictions',     // F1 race podiums
  'f1_season_picks',    // F1 drivers' + constructors' champions
];

// Groups already recomputed this app session
const verifiedGroups = new Set<string>();

/**
 * Recompute every member's totalPoints from the pointsEarned on their picks.
 * Totals are derived, never incremented, so two members scoring at the same
 * time write the same numbers instead of double counting. Reading the group
 * inside a transaction means a member who joins mid-write isn't dropped.
 *
 * Runs when new scores were written, or once per group per session so totals
 * edited by hand get repaired — not on every live-score refresh.
 */
export async function recomputeGroupTotals(groupId: string, scoresChanged = true): Promise<void> {
  if (!scoresChanged && verifiedGroups.has(groupId)) return;
  const snaps = await Promise.all(
    SCORED_COLLECTIONS.map(c => getDocs(query(collection(db, c), where('groupId', '==', groupId))))
  );

  const totals = new Map<string, number>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const { uid, pointsEarned } = d.data();
      if (typeof pointsEarned === 'number') totals.set(uid, (totals.get(uid) ?? 0) + pointsEarned);
    }
  }

  const groupRef = doc(db, 'groups', groupId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(groupRef);
    if (!snap.exists()) return;
    const members = (snap.data().members ?? []) as GroupMember[];
    const updated = members.map(m => ({ ...m, totalPoints: totals.get(m.uid) ?? 0 }));
    if (updated.every((m, i) => m.totalPoints === members[i].totalPoints)) return;
    tx.update(groupRef, { members: updated });
  });
  verifiedGroups.add(groupId);
}

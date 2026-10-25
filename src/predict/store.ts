import { collection, query, where, getDocs, addDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { recomputeGroupTotals } from '../utils/groupTotals';

// Firestore helpers shared by every sport's prediction screen.

export interface PickDoc {
  id: string;
  uid: string;
  groupId: string;
  pointsEarned?: number;
  [field: string]: any;
}

/** All picks in a collection for one group */
export async function loadPicks<T extends PickDoc>(col: string, groupId: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, col), where('groupId', '==', groupId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
}

/** Create or update the user's pick identified by `key` fields (e.g. { targetId }) */
export async function savePick(
  col: string, uid: string, groupId: string,
  key: Record<string, string | number>, data: Record<string, any>,
): Promise<void> {
  let q = query(collection(db, col), where('uid', '==', uid), where('groupId', '==', groupId));
  for (const [k, v] of Object.entries(key)) q = query(q, where(k, '==', v));
  const existing = await getDocs(q);
  const payload = { ...data, ...key, uid, groupId, submittedAt: Date.now() };
  if (!existing.empty) await updateDoc(doc(db, col, existing.docs[0].id), payload);
  else await addDoc(collection(db, col), payload);
}

/** Write pointsEarned for newly scored picks, then rebuild the group's totals.
 *  Scoring failures are logged, never shown — the screen still renders. */
export async function commitScores(groupId: string, scores: { col: string; id: string; points: number }[]): Promise<boolean> {
  try {
    if (scores.length > 0) {
      // Firestore batches cap at 500 writes
      for (let i = 0; i < scores.length; i += 450) {
        const batch = writeBatch(db);
        for (const s of scores.slice(i, i + 450)) batch.update(doc(db, s.col, s.id), { pointsEarned: s.points });
        await batch.commit();
      }
    }
    await recomputeGroupTotals(groupId, scores.length > 0);
    return scores.length > 0;
  } catch (e) {
    console.error('[predict] scoring error:', e);
    return false;
  }
}

/** Has this start time passed? (picks lock at the start) */
export const hasStarted = (iso: string | undefined): boolean => !!iso && new Date(iso).getTime() <= Date.now();

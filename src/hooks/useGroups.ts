import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Group, GroupMember, GroupType } from '../types';
import { useAuthContext } from '../context/AuthContext';

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function useGroups() {
  const { user } = useAuthContext();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setGroups([]); setLoading(false); return; }

    const q = query(
      collection(db, 'groups'),
      where('memberUids', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group)));
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const createGroup = async (name: string, type: GroupType = 'season', leagueIds?: number[]): Promise<string> => {
    if (!user) throw new Error('Not logged in');

    const member: GroupMember = {
      uid: user.uid,
      displayName: user.displayName ?? 'Anonymous',
      photoURL: user.photoURL ?? undefined,
      totalPoints: 0,
    };

    const data: any = {
      name,
      inviteCode: generateInviteCode(),
      adminUid: user.uid,
      members: [member],
      memberUids: [user.uid],
      createdAt: Date.now(),
      season: '2024-25',
      type,
    };

    if (type === 'football' && leagueIds && leagueIds.length > 0) {
      data.leagueIds = leagueIds;
    }

    const ref = await addDoc(collection(db, 'groups'), data);
    return ref.id;
  };

  const joinGroupByCode = async (code: string): Promise<string | null> => {
    if (!user) throw new Error('Not logged in');

    const q = query(collection(db, 'groups'), where('inviteCode', '==', code.toUpperCase()));
    const snap = await getDocs(q);

    if (snap.empty) return null;

    const groupDoc = snap.docs[0];
    const groupData = groupDoc.data() as Group;

    // Already a member
    if (groupData.members.some((m) => m.uid === user.uid)) return groupDoc.id;

    const newMember: GroupMember = {
      uid: user.uid,
      displayName: user.displayName ?? 'Anonymous',
      photoURL: user.photoURL ?? undefined,
      totalPoints: 0,
    };

    await updateDoc(doc(db, 'groups', groupDoc.id), {
      members: arrayUnion(newMember),
      memberUids: arrayUnion(user.uid),
    });

    return groupDoc.id;
  };

  const getGroupById = async (id: string): Promise<Group | null> => {
    const snap = await getDoc(doc(db, 'groups', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Group;
  };

  return { groups, loading, createGroup, joinGroupByCode, getGroupById };
}

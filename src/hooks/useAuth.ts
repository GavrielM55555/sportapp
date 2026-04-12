import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

async function upsertUserDoc(user: User) {
  await setDoc(
    doc(db, 'users', user.uid),
    {
      uid: user.uid,
      displayName: user.displayName ?? 'Anonymous',
      email: user.email ?? '',
      photoURL: user.photoURL ?? null,
      lastSeen: serverTimestamp(),
    },
    { merge: true } // won't overwrite existing fields like totalPoints
  );
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) upsertUserDoc(u).catch(console.error);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    await upsertUserDoc(result.user);
  };

  const logout = () => signOut(auth);

  return { user, loading, signInWithGoogle, logout };
}

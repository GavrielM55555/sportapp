import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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
    // On web, handle redirect result after Google redirects back
    if (Platform.OS === 'web') {
      getRedirectResult(auth)
        .then(result => { if (result?.user) upsertUserDoc(result.user).catch(console.error); })
        .catch(console.error);
    }
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    if (Platform.OS === 'web') {
      // Redirect flow: sends user to Google, then back to the app
      await signInWithRedirect(auth, provider);
    } else {
      const result = await signInWithPopup(auth, provider);
      await upsertUserDoc(result.user);
    }
  };

  const logout = () => signOut(auth);

  return { user, loading, signInWithGoogle, logout };
}

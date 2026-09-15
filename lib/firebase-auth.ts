// ─── Cozy Hall · Firebase Authentication (Google Sign-in) ────────────────────
// Only ever imported dynamically from AuthGate's firebase branch, so the
// Firebase SDK never touches the dev-quickplay bundle.

import type { User } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";
import { colorForName, type Identity } from "./auth";

let app: FirebaseApp | null = null;

export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (app) return app;
  const { initializeApp, getApps } = await import("firebase/app");
  app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  return app;
}

function identityFromUser(user: User): Identity {
  const name = (user.displayName ?? user.email?.split("@")[0] ?? "Friend").slice(0, 14);
  return {
    uid: user.uid,
    name,
    color: colorForName(user.uid + name),
    photoUrl: user.photoURL ?? undefined,
    signOut: () => void signOutUser(),
  };
}

export async function signInWithGoogle(): Promise<Identity> {
  const a = await getFirebaseApp();
  const { getAuth, GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const cred = await signInWithPopup(getAuth(a), new GoogleAuthProvider());
  return identityFromUser(cred.user);
}

export async function watchAuth(cb: (id: Identity | null) => void): Promise<() => void> {
  const a = await getFirebaseApp();
  const { getAuth, onAuthStateChanged } = await import("firebase/auth");
  return onAuthStateChanged(getAuth(a), (user) => cb(user ? identityFromUser(user) : null));
}

export async function signOutUser(): Promise<void> {
  const a = await getFirebaseApp();
  const { getAuth, signOut } = await import("firebase/auth");
  await signOut(getAuth(a));
}

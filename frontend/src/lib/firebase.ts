import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, type Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || undefined,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId
  );
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured()) {
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: 'select_account',
  });
}

export { firebaseApp, firebaseAuth, googleProvider };

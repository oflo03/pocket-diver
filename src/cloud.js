// Cloud saves (Firebase): every player gets a guest (anonymous) account on the first visit, which can be linked to a
// Google account later from the title screen (same account, saves kept), and the save slots kept in Firestore at
// users/{uid}/saves/{slot} as { data: <the save's JSON>, savedAt }. Off (no sign-in, saves stay in this browser)
// until the VITE_FIREBASE_* keys are set in .env.local (see .env.example, docs/firebase.md); the SDK loads only then.
// The game keeps reading and writing localStorage, which is the cache: signing in pulls the cloud slots down (per slot
// the newer of cloud and local wins, so saves made before signing in go up once), and saves go up at most every
// PUSH_EVERY s while playing, plus at once when leaving to the title.
const env = import.meta.env ?? {}; // (empty under node: scripts/check.mjs tests syncPlan)
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
};
export const enabled = !!(config.apiKey && config.projectId && config.appId);
const PUSH_EVERY = 30; // Firestore bills per write; the game saves locally every 5 s
const OWNER_KEY = 'pocket-diver-owner'; // the account the local saves belong to
const backupKey = slot => `pocket-diver-backup-${slot}`;

let fb = null;
function sdk() {
  fb ??= Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]).then(([{ initializeApp }, A, F]) => {
    const app = initializeApp(config);
    // writes made offline wait in IndexedDB and go up on a later visit
    return { A, F, auth: A.getAuth(app), db: F.initializeFirestore(app, { localCache: F.persistentLocalCache() }) };
  });
  return fb;
}
const slotDoc = (s, uid, slot) => s.F.doc(s.db, 'users', uid, 'saves', String(slot));
const savedAt = json => { try { return JSON.parse(json)?.savedAt ?? 0; } catch { return 0; } };

// the signed-in user, once Firebase has restored the session; nobody signed in yet: a new guest account (null if cloud
// saves are off, or guest accounts are not enabled in the Firebase console)
export async function user() {
  if (!enabled) return null;
  const s = await sdk();
  await s.auth.authStateReady();
  if (!s.auth.currentUser) await s.A.signInAnonymously(s.auth).catch(e => console.warn('guest sign-in', e.code));
  return s.auth.currentUser;
}
// Google: a guest account is linked to it (same account, its saves stay). If that Google account already has an
// account of its own here, it signs in to that one instead, and this browser's saves count as from before sign-in
// (sync keeps the newer per slot and backs up the one it replaces).
export async function signIn() {
  const s = await sdk(), provider = new s.A.GoogleAuthProvider(), cur = s.auth.currentUser;
  try {
    return cur?.isAnonymous ? (await s.A.linkWithPopup(cur, provider)).user : (await s.A.signInWithPopup(s.auth, provider)).user;
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      try { localStorage.removeItem(OWNER_KEY); } catch { /* private mode */ }
      return (await s.A.signInWithCredential(s.auth, s.A.GoogleAuthProvider.credentialFromError(e))).user;
    }
    // no popups here (some embedded browsers): go to Google's page and come back signed in
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')
      return cur?.isAnonymous ? s.A.linkWithRedirect(cur, provider) : s.A.signInWithRedirect(s.auth, provider);
    throw e;
  }
}
export async function signOut() { if (enabled) { const s = await sdk(); await s.A.signOut(s.auth); } }

// After signing in: per slot, the newer save of cloud and this browser is copied over the other. Local saves of another
// account (signed in here before, never signed out) are dropped first: theirs are in their cloud. A local save from
// before sign-in existed (no owner) that the cloud's would overwrite is kept in pocket-diver-backup-<slot>.
export async function sync(slots, keyOf, store) {
  const u = await user();
  if (!u) return;
  const s = await sdk(), owner = store.get(OWNER_KEY);
  if (owner && owner !== u.uid) for (let n = 1; n <= slots; n++) store.del(keyOf(n));
  const cloud = {}, local = {};
  (await s.F.getDocs(s.F.collection(s.db, 'users', u.uid, 'saves'))).forEach(d => { cloud[d.id] = d.data(); });
  for (let n = 1; n <= slots; n++) local[n] = store.get(keyOf(n));
  const ups = [];
  for (const p of syncPlan(slots, cloud, local, owner === u.uid)) {
    if (p.backup) store.set(backupKey(p.n), local[p.n]);
    if (p.down) store.set(keyOf(p.n), cloud[p.n].data);
    else ups.push(s.F.setDoc(slotDoc(s, u.uid, p.n), { data: local[p.n], savedAt: p.at }));
  }
  await Promise.all(ups);
  store.set(OWNER_KEY, u.uid);
}
// per slot: the cloud copy comes down over an older (or missing) local one, or the local one goes up; the same save on
// both sides needs nothing. owned: the local saves are this account's (else they are from before sign-in and a
// replaced one is backed up).
export function syncPlan(slots, cloud, local, owned) {
  const plan = [];
  for (let n = 1; n <= slots; n++) {
    const c = cloud[n], l = local[n], at = savedAt(l);
    if (c && (!l || c.savedAt >= at)) { if (l !== c.data) plan.push({ n, down: true, backup: !!l && !owned }); }
    else if (l) plan.push({ n, up: true, at });
  }
  return plan;
}
// signing out leaves nothing of this account in the browser (call after a sync, so nothing local is newer)
export function forget(slots, keyOf, store) {
  for (let n = 1; n <= slots; n++) store.del(keyOf(n));
  store.del(OWNER_KEY);
}
export async function remove(slot) {
  const u = await user();
  if (u) { const s = await sdk(); await s.F.deleteDoc(slotDoc(s, u.uid, slot)); }
}

// while playing: the latest save goes up, at most every PUSH_EVERY s
let pending = null, timer = 0, lastPush = 0;
export function push(slot, json, at) {
  if (!enabled) return;
  pending = { slot, json, at };
  if (!timer) timer = setTimeout(flush, Math.max(0, lastPush + PUSH_EVERY * 1000 - Date.now()));
}
export async function flush() {
  clearTimeout(timer); timer = 0;
  const p = pending;
  pending = null;
  if (!p) return;
  lastPush = Date.now();
  try {
    const u = await user();
    if (u) { const s = await sdk(); await s.F.setDoc(slotDoc(s, u.uid, p.slot), { data: p.json, savedAt: p.at }); }
  } catch (e) { console.warn('cloud save failed', e); } // offline etc.: the local save is newer, and the next sync sends it
}
// gives up waiting after ms (offline the write stays queued in IndexedDB; the next sync sends the local save anyway)
export const within = (promise, ms) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

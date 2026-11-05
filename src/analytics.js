// Play stats for the shared app-stats-hub dashboard, under apps/diver there (its firestore.rules allow only the apps it
// lists). Off on the dev server. The SDK loads lazily, as its own named Firebase app beside the cloud saves' project.
// Each call is at most three writes (event, summary counters, the day's counter), so only the big moments are sent:
// a session starting, the progress milestones, fainting, upgrades bought, shinies caught. Nothing personal is sent;
// a player is a random id kept in this browser.
const APP_ID = 'diver';
const config = {
  projectId: 'app-stats-hub', appId: '1:652443691928:web:5b01c2ed99e7c55de999ed', apiKey: 'AIzaSyC8ylQHndr2wArgUraSAN2_KIlAhr_GRj0',
  authDomain: 'app-stats-hub.firebaseapp.com', storageBucket: 'app-stats-hub.firebasestorage.app', messagingSenderId: '652443691928',
};
const enabled = !import.meta.env.DEV;

let fb = null;
function sdk() {
  fb ??= Promise.all([import('firebase/app'), import('firebase/firestore')])
    .then(([{ initializeApp }, F]) => ({ F, db: F.getFirestore(initializeApp(config, 'stats')) }));
  return fb;
}
function clientId() {
  try {
    let id = localStorage.getItem('pocket-diver-client');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('pocket-diver-client', id); }
    return id;
  } catch { return 'unknown'; }
}

let userChecked = false;
// counters: summary fields to add to ({ name: n }); day: the day's field to add one to ('starts' or 'clears')
async function send(type, data, counters, day) {
  if (!enabled) return;
  try {
    const { F, db } = await sdk(), cid = clientId(), app = F.doc(db, 'apps', APP_ID, 'counters', 'summary');
    if (!userChecked) { // a browser seen for the first time adds one to the player count
      userChecked = true;
      const ref = F.doc(db, 'apps', APP_ID, 'users', cid);
      if (!(await F.getDoc(ref)).exists()) { await F.setDoc(ref, { ts: F.serverTimestamp() }); counters = { ...counters, userCount: 1 }; }
    }
    const writes = [F.setDoc(app, Object.fromEntries(Object.entries(counters).map(([k, n]) => [k, F.increment(n)])), { merge: true })];
    if (type) writes.push(F.addDoc(F.collection(db, 'apps', APP_ID, 'events'), { type, ...data, clientId: cid, ts: F.serverTimestamp() }));
    if (day) writes.push(F.setDoc(F.doc(db, 'apps', APP_ID, 'daily', new Date().toISOString().slice(0, 10)), { [day]: F.increment(1) }, { merge: true }));
    await Promise.all(writes);
  } catch { /* offline or blocked: stats are best effort */ }
}

// a session: a new game (with its starter line) or a saved one continued
export function playStart(isNew, line) {
  send('play_start', { kind: isNew ? 'new' : 'continue', starter: line },
    { totalStarts: 1, [isNew ? 'newGames' : 'continues']: 1, ...(isNew ? { [`starter_${line}_starts`]: 1 } : {}) }, 'starts');
}
// a progress milestone (each save sends each once): its name, with the level and minutes played when it was reached
export function milestone(name, line, level, minutes, clear = false) {
  send('milestone', { name, starter: line, level, minutes }, { [`ms_${name}`]: 1, ...(clear ? { totalClears: 1, [`starter_${line}_clears`]: 1 } : {}) }, clear ? 'clears' : null);
}
// a counter only, no log line (fainting, upgrades bought)
export const count = name => send(null, null, { [name]: 1 });
export const shiny = (species, zone) => send('shiny', { species, zone }, { shiny_caught: 1 });

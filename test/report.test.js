import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveLoad, exerciseSessionStats, setTonnage, setVolume, weekStart, weeklyTotals } from '../js/report.js';

const panca = { name: 'Panca', type: 'weight', category: 'forza', sets: 2, reps: { min: 8, max: 10 }, load: 'total' };
const curl = { name: 'Curl', type: 'weight', category: 'forza', sets: 2, reps: { min: 8, max: 10 }, load: 'per-dumbbell' };
const affondo = { name: 'Affondo', type: 'weight', category: 'forza', sets: 2, sides: 2, reps: { min: 8, max: 10 }, load: 'total' };
const trazioni = { name: 'Trazioni', type: 'weight', category: 'forza', sets: 2, reps: { min: 8, max: 10 }, load: 'total', assisted: true };
const piegamenti = { name: 'Piegamenti', type: 'bodyweight', category: 'forza', sets: 2, reps: { min: 1, max: null } };
const plank = { name: 'Plank', type: 'time', category: 'forza', sets: 2, duration: { min: 1, max: null } };
const mobilita = { name: 'Mobilità', type: 'time', category: 'mobilita', sets: 2, sides: 2, duration: { min: 30, max: 30 } };
const bike = { name: 'Bike', type: 'cardio', category: 'forza', sets: 1, duration: { min: 300, max: 300 } };

const done = (fields) => ({ effort: 'giusta', ...fields });

// Sessione terminata minimale: solo i campi letti da report.js ed exerciseHistory.
const session = (id, endedAt, targets, entries, bodyWeight = null) => ({
  id,
  workoutId: 'A',
  startedAt: endedAt,
  endedAt,
  targets,
  entries,
  bodyWeight,
});

test('effectiveLoad: total, per-dumbbell, time', () => {
  assert.equal(effectiveLoad({ weight: 60 }, panca, null), 60);
  assert.equal(effectiveLoad({ weight: 10 }, curl, null), 20);
  assert.equal(effectiveLoad({ duration: 40 }, plank, 80), null);
  assert.equal(effectiveLoad({ weight: null }, panca, null), null);
});

test('effectiveLoad: assistito usa peso corporeo meno assistenza, mai sotto 0, null senza peso corporeo', () => {
  assert.equal(effectiveLoad({ weight: 25 }, trazioni, 80), 55);
  assert.equal(effectiveLoad({ weight: 90 }, trazioni, 80), 0);
  assert.equal(effectiveLoad({ weight: 25 }, trazioni, null), null);
});

test('effectiveLoad: corpo libero usa peso corporeo più zavorra, null senza peso corporeo', () => {
  assert.equal(effectiveLoad({ weight: 0, reps: 10 }, piegamenti, 80), 80);
  assert.equal(effectiveLoad({ weight: 5, reps: 10 }, piegamenti, 80), 85);
  assert.equal(effectiveLoad({ reps: 10 }, piegamenti, 80), 80);
  assert.equal(effectiveLoad({ weight: 5, reps: 10 }, piegamenti, null), null);
});

test('setVolume: ripetizioni o secondi per il numero di lati', () => {
  assert.equal(setVolume({ weight: 60, reps: 10 }, panca), 10);
  assert.equal(setVolume({ weight: 20, reps: 10 }, affondo), 20);
  assert.equal(setVolume({ duration: 45 }, plank), 45);
  assert.equal(setVolume({ weight: 60, reps: null }, panca), null);
});

test('setTonnage: carico × ripetizioni × lati, null senza carico o ripetizioni', () => {
  assert.equal(setTonnage({ weight: 60, reps: 10 }, panca, null), 600);
  assert.equal(setTonnage({ weight: 10, reps: 10 }, curl, null), 200);
  assert.equal(setTonnage({ weight: 20, reps: 10 }, affondo, null), 400);
  assert.equal(setTonnage({ weight: 25, reps: 8 }, trazioni, 80), 440);
  assert.equal(setTonnage({ weight: 25, reps: 8 }, trazioni, null), null);
  assert.equal(setTonnage({ weight: 60, reps: null }, panca, null), null);
  assert.equal(setTonnage({ duration: 45 }, plank, 80), null);
});

test('exerciseSessionStats: volume e tonnellaggio delle sole serie fatte, in ordine di data', () => {
  const sessions = [
    session('s2', '2026-09-24T19:00:00.000Z', { panca }, { panca: [done({ weight: 62.5, reps: 8 }), done({ weight: 62.5, reps: 8 })] }),
    session('s1', '2026-09-22T19:00:00.000Z', { panca }, { panca: [done({ weight: 60, reps: 10 }), { weight: 60, reps: 10, effort: null }] }),
  ];
  const stats = exerciseSessionStats(sessions, 'panca');
  assert.deepEqual(stats.map((item) => item.sessionId), ['s1', 's2']);
  assert.deepEqual(
    stats.map(({ volume, volumeUnit, tonnage, metric }) => ({ volume, volumeUnit, tonnage, metric })),
    [
      { volume: 10, volumeUnit: 'rip', tonnage: 600, metric: '1rm' },
      { volume: 16, volumeUnit: 'rip', tonnage: 1000, metric: '1rm' },
    ],
  );
  assert.equal(stats[0].value, 80);
});

test('exerciseSessionStats: time in secondi senza tonnellaggio; assistito senza peso corporeo senza tonnellaggio', () => {
  const sessions = [
    session('s1', '2026-09-22T19:00:00.000Z', { plank, trazioni }, {
      plank: [done({ duration: 40 }), done({ duration: 50 })],
      trazioni: [done({ weight: 25, reps: 8 }), done({ weight: 25, reps: 8 })],
    }),
  ];
  const [plankStats] = exerciseSessionStats(sessions, 'plank');
  assert.equal(plankStats.volume, 90);
  assert.equal(plankStats.volumeUnit, 's');
  assert.equal(plankStats.tonnage, null);
  assert.equal(exerciseSessionStats(sessions, 'trazioni')[0].tonnage, null);
});

test('exerciseSessionStats: esclude stretching/mobilità e cardio', () => {
  const sessions = [
    session('s1', '2026-09-22T19:00:00.000Z', { mobilita, bike }, {
      mobilita: [{ duration: 30, effort: 'fatto' }, { duration: 30, effort: 'fatto' }],
      bike: [done({ duration: 300 })],
    }),
  ];
  assert.deepEqual(exerciseSessionStats(sessions, 'mobilita'), []);
  assert.deepEqual(exerciseSessionStats(sessions, 'bike'), []);
});

test('weekStart: lunedì 00:00 locale; la domenica sera appartiene alla settimana che finisce', () => {
  const sundayNight = new Date(2026, 8, 27, 23, 30);
  const mondayMorning = new Date(2026, 8, 28, 0, 5);
  assert.equal(weekStart(sundayNight).getTime(), new Date(2026, 8, 21).getTime());
  assert.equal(weekStart(mondayMorning).getTime(), new Date(2026, 8, 28).getTime());
  assert.equal(weekStart(new Date(2026, 9, 1, 12)).getTime(), new Date(2026, 8, 28).getTime());
});

test('weeklyTotals: nessuna sessione -> []', () => {
  assert.deepEqual(weeklyTotals([], new Date(2026, 9, 1), 4), []);
});

test('weeklyTotals: settimane consecutive, vuote a 0, partial solo sulla settimana di now', () => {
  const now = new Date(2026, 9, 1, 12);
  const sessions = [
    session('s1', new Date(2026, 8, 8, 19).toISOString(), { panca }, { panca: [done({ weight: 60, reps: 10 }), done({ weight: 60, reps: 10 })] }),
    session('s2', new Date(2026, 8, 29, 19).toISOString(), { panca }, { panca: [done({ weight: 60, reps: 8 }), done({ weight: 60, reps: 8 })] }),
  ];
  const all = weeklyTotals(sessions, now, null);
  assert.deepEqual(
    all.map(({ weekStart: start, sessions: count, tonnage, volume, partial }) => [new Date(start).getDate(), count, tonnage, volume, partial]),
    [
      [7, 1, 1200, 20, false],
      [14, 0, 0, 0, false],
      [21, 0, 0, 0, false],
      [28, 1, 960, 16, true],
    ],
  );
  assert.equal(weeklyTotals(sessions, now, 4).length, 4);
  assert.equal(weeklyTotals(sessions, now, 12).length, 12);
  assert.equal(weeklyTotals(sessions, now, 12)[0].sessions, 0);
});

test('weeklyTotals: il cardio conta come sessione ma non nel carico; i secondi non entrano nel volume', () => {
  const now = new Date(2026, 9, 1, 12);
  const sessions = [
    session('s1', new Date(2026, 8, 29, 19).toISOString(), { bike, plank, affondo }, {
      bike: [done({ duration: 900 })],
      plank: [done({ duration: 60 }), done({ duration: 60 })],
      affondo: [done({ weight: 20, reps: 10 }), { weight: 20, reps: 10, effort: null }],
    }),
    session('s2', new Date(2026, 8, 30, 19).toISOString(), { bike }, { bike: [done({ duration: 900 })] }),
  ];
  const [week] = weeklyTotals(sessions, now, 1);
  assert.equal(week.sessions, 2);
  assert.equal(week.tonnage, 400);
  assert.equal(week.volume, 20);
});

test('weeklyTotals: tonnellaggio del corpo libero col peso corporeo della sessione', () => {
  const now = new Date(2026, 9, 1, 12);
  const sessions = [
    session('s1', new Date(2026, 8, 29, 19).toISOString(), { piegamenti }, { piegamenti: [done({ weight: 0, reps: 10 }), done({ weight: 0, reps: 10 })] }, 80.3),
    session('s2', new Date(2026, 8, 30, 19).toISOString(), { piegamenti }, { piegamenti: [done({ weight: 0, reps: 10 }), done({ weight: 0, reps: 10 })] }),
  ];
  const [week] = weeklyTotals(sessions, now, 1);
  assert.equal(week.tonnage, 1606);
  assert.equal(week.volume, 40);
});

test('target salvati prima di category/sides/load (backup vecchi): forza, 1 lato, carico totale', () => {
  const legacy = { name: 'Panca', type: 'weight', sets: 1, reps: { min: 8, max: 10 } };
  assert.equal(setTonnage({ weight: 60, reps: 10 }, legacy, null), 600);
  assert.equal(setVolume({ weight: 60, reps: 10 }, legacy), 10);
  const sessions = [session('s1', '2026-09-22T19:00:00.000Z', { panca: legacy }, { panca: [done({ weight: 60, reps: 10 })] })];
  sessions[0].bodyWeight = undefined;
  assert.equal(exerciseSessionStats(sessions, 'panca')[0].tonnage, 600);
});

test('weeklyTotals: a cavallo del cambio ora ogni settimana parte di lunedì alle 00:00', () => {
  const now = new Date(2026, 10, 4, 12);
  const sessions = [session('s1', new Date(2026, 9, 26, 0, 30).toISOString(), { panca }, { panca: [done({ weight: 60, reps: 10 })] })];
  const weeks = weeklyTotals(sessions, now, 6);
  assert.equal(weeks.length, 6);
  weeks.forEach((week) => {
    const start = new Date(week.weekStart);
    assert.equal(start.getDay(), 1);
    assert.equal(start.getHours(), 0);
  });
  assert.deepEqual(weeks.map((week) => week.sessions), [0, 0, 0, 0, 1, 0]);
});

test('weeklyTotals: una sessione con data futura (orologio sbagliato) non rompe il periodo', () => {
  const now = new Date(2026, 9, 1, 12);
  const future = [session('s1', new Date(2026, 11, 1, 19).toISOString(), { panca }, { panca: [done({ weight: 60, reps: 10 })] })];
  assert.deepEqual(weeklyTotals(future, now, null), []);
  assert.deepEqual(weeklyTotals(future, now, 4).map((week) => week.sessions), [0, 0, 0, 0]);
});

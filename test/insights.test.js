import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeProgram, findWorkout } from '../js/program.js';
import { loadAdvice } from '../js/advice.js';
import {
  INSIGHT_KINDS,
  TRAINER_SUFFIX,
  exerciseInsights,
  globalInsights,
  programLoadExercises,
  progressInsights,
} from '../js/insights.js';

// Scheda di prova: un esercizio per ogni caso (weight, assistito, MAX a tempo, mobilità).
const program = normalizeProgram({
  workouts: [
    {
      id: 'A',
      name: 'Giorno 1',
      blocks: [
        { phase: 'riscaldamento', exercises: [{ id: 'mobilita', name: 'Mobilità', type: 'time', category: 'mobilita', sets: 1, duration: 30 }] },
        { exercises: [{ id: 'panca', name: 'Panca', type: 'weight', sets: 2, reps: { min: 8, max: 10 } }] },
        { exercises: [{ id: 'plank', name: 'Plank', type: 'time', sets: 1, duration: 'max' }] },
      ],
    },
    {
      id: 'B',
      name: 'Giorno 2',
      blocks: [{ exercises: [{ id: 'trazioni', name: 'Trazioni', type: 'weight', assisted: true, sets: 2, reps: { min: 8, max: 10 } }] }],
    },
    {
      id: 'C',
      name: 'Giorno 3',
      blocks: [{ exercises: [{ id: 'panca', name: 'Panca', type: 'weight', sets: 2, reps: { min: 8, max: 10 } }] }],
    },
  ],
});

const exercise = (id) => programLoadExercises(program).find((item) => item.id === id);

// Data locale alle 19:00, `offset` giorni dopo il 1° settembre 2026.
const day = (offset) => new Date(2026, 8, 1 + offset, 19);

let sequence = 0;
// Sessione terminata come la produrrebbe finishSession: targets copiati dalla scheda; le serie
// non indicate restano non fatte.
const sessionOf = (workoutId, endedAt, setsById = {}, bodyWeight = null) => {
  const workout = findWorkout(program, workoutId);
  const targets = {};
  const entries = {};
  workout.blocks.forEach((block) =>
    block.exercises.forEach(({ id, ...target }) => {
      targets[id] = target;
      const given = setsById[id] ?? [];
      entries[id] = Array.from({ length: target.sets }, (_, index) => given[index] ?? { weight: null, reps: null, effort: null });
    }),
  );
  sequence += 1;
  return {
    id: `s${sequence}`,
    workoutId,
    workoutName: workout.name,
    startedAt: endedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    bodyWeight,
    blocks: [],
    targets,
    entries,
  };
};

const lifts = (weight, ...repsList) => repsList.map((reps) => ({ weight, reps, effort: 'giusta' }));
const hold = (seconds) => [{ duration: seconds, effort: 'giusta' }];
const kinds = (list) => list.map((item) => item.kind);

test('programLoadExercises: una volta per id, solo forza non cardio, ordine della scheda', () => {
  assert.deepEqual(programLoadExercises(program).map((item) => item.id), ['panca', 'plank', 'trazioni']);
});

test('nessuno storico o esercizio non di forza: nessun suggerimento', () => {
  assert.deepEqual(exerciseInsights([], exercise('panca'), day(30)), []);
  const mobilita = findWorkout(program, 'A').blocks[0].exercises[0];
  const sessions = [sessionOf('A', day(1), { mobilita: [{ duration: 30, effort: 'fatto' }] })];
  assert.deepEqual(exerciseInsights(sessions, mobilita, day(2)), []);
});

test('ready-up: delega a loadAdvice, stesso testo', () => {
  const sessions = [sessionOf('A', day(1), { panca: lifts(60, 11, 12) })];
  const list = exerciseInsights(sessions, exercise('panca'), day(2));
  assert.deepEqual(list, [{
    kind: 'ready-up',
    tone: 'positive',
    text: loadAdvice(sessions, 'panca', exercise('panca')).text,
    exerciseId: 'panca',
    name: 'Panca',
  }]);
});

test('ready-up assente se una serie non supera il massimo', () => {
  const sessions = [sessionOf('A', day(1), { panca: lifts(60, 11, 10) })];
  assert.deepEqual(kinds(exerciseInsights(sessions, exercise('panca'), day(2))), []);
});

test('below-min: una serie sotto il minimo in ciascuna delle ultime 2 sessioni', () => {
  const sessions = [
    sessionOf('A', day(1), { panca: lifts(60, 9, 7) }),
    sessionOf('A', day(3), { panca: lifts(60, 7, 8) }),
  ];
  const [first] = exerciseInsights(sessions, exercise('panca'), day(4));
  assert.equal(first.kind, 'below-min');
  assert.equal(first.tone, 'attention');
  assert.equal(first.text, 'Sotto 8 rip nelle ultime 2 sessioni: parlane col trainer');
});

test('below-min assente con una sola sessione sotto il minimo', () => {
  const sessions = [
    sessionOf('A', day(1), { panca: lifts(60, 9, 8) }),
    sessionOf('A', day(3), { panca: lifts(60, 7, 8) }),
  ];
  assert.ok(!kinds(exerciseInsights(sessions, exercise('panca'), day(4))).includes('below-min'));
});

test('range MAX: niente below-min né ready-up, il trend sì', () => {
  const sessions = [
    sessionOf('A', day(1), { plank: hold(40) }),
    sessionOf('A', day(3), { plank: hold(1) }),
    sessionOf('A', day(5), { plank: hold(60) }),
  ];
  assert.deepEqual(kinds(exerciseInsights(sessions, exercise('plank'), day(6))), ['progress']);
});

test('progress: soglia esatta del 2% nella finestra; 1,9% niente', () => {
  const at = (values) => values.map((seconds, index) => sessionOf('A', day(index * 2), { plank: hold(seconds) }));
  const up = exerciseInsights(at([1000, 1005, 1020]), exercise('plank'), day(5));
  assert.deepEqual(up.map(({ kind, text }) => ({ kind, text })), [{ kind: 'progress', text: 'Durata +2% in 4 settimane' }]);
  assert.deepEqual(exerciseInsights(at([1000, 1005, 1019]), exercise('plank'), day(5)), []);
});

test('decline: soglia esatta del −5%; −4,9% niente', () => {
  const at = (values) => values.map((seconds, index) => sessionOf('A', day(index * 2), { plank: hold(seconds) }));
  const down = exerciseInsights(at([1000, 990, 950]), exercise('plank'), day(5));
  assert.deepEqual(down.map(({ kind, tone, text }) => ({ kind, tone, text })), [
    { kind: 'decline', tone: 'attention', text: 'Durata −5% in 4 settimane: parlane col trainer' },
  ]);
  assert.deepEqual(exerciseInsights(at([1000, 990, 951]), exercise('plank'), day(5)), []);
});

test('trend: servono 3 sessioni nella finestra di 28 giorni', () => {
  const sessions = [
    sessionOf('A', day(0), { plank: hold(40) }),
    sessionOf('A', day(20), { plank: hold(50) }),
    sessionOf('A', day(30), { plank: hold(60) }),
  ];
  assert.deepEqual(exerciseInsights(sessions, exercise('plank'), day(31)), []);
  assert.deepEqual(exerciseInsights(sessions.slice(1), exercise('plank'), day(31)), []);
});

test('stall: nessun nuovo massimo nelle ultime 4 sessioni (parità compresa), prevale su progress', () => {
  const values = [70, 60, 65, 70, 68];
  const sessions = values.map((seconds, index) => sessionOf('A', day(index * 10), { plank: hold(seconds) }));
  const list = exerciseInsights(sessions, exercise('plank'), day(41));
  assert.deepEqual(list.map(({ kind, text }) => ({ kind, text })), [
    { kind: 'stall', text: 'Nessun nuovo massimo in 4 sessioni: parlane col trainer' },
  ]);
});

test('stall: servono 5 sessioni; un nuovo massimo lo esclude', () => {
  const four = [70, 60, 65, 70].map((seconds, index) => sessionOf('A', day(index * 10), { plank: hold(seconds) }));
  assert.ok(!kinds(exerciseInsights(four, exercise('plank'), day(31))).includes('stall'));
  const record = [70, 60, 65, 71, 68].map((seconds, index) => sessionOf('A', day(index * 10), { plank: hold(seconds) }));
  assert.ok(!kinds(exerciseInsights(record, exercise('plank'), day(41))).includes('stall'));
});

test('decline prevale su stall', () => {
  const values = [100, 100, 100, 100, 94];
  const sessions = values.map((seconds, index) => sessionOf('A', day(index * 3), { plank: hold(seconds) }));
  assert.deepEqual(kinds(exerciseInsights(sessions, exercise('plank'), day(13))), ['decline']);
});

test('stall non si segnala quando è pronto l\'aumento', () => {
  const sessions = [0, 1, 2, 3, 4].map((index) => sessionOf('A', day(index * 3), { panca: lifts(60, 11, 11) }));
  assert.deepEqual(kinds(exerciseInsights(sessions, exercise('panca'), day(13))), ['ready-up']);
});

test('assistenza senza peso corporeo: meno è meglio, testi in kg', () => {
  const at = (values) => values.map((assist, index) => sessionOf('B', day(index * 2), { trazioni: lifts(assist, 9, 9) }));
  const better = exerciseInsights(at([30, 27.5, 25]), exercise('trazioni'), day(5));
  assert.deepEqual(better.map(({ kind, text }) => ({ kind, text })), [
    { kind: 'progress', text: 'Assistenza da 30 a 25 kg in 4 settimane' },
  ]);
  const worse = exerciseInsights(at([25, 27.5, 30]), exercise('trazioni'), day(5));
  assert.deepEqual(worse.map(({ kind, text }) => ({ kind, text })), [
    { kind: 'decline', text: 'Assistenza da 25 a 30 kg in 4 settimane: parlane col trainer' },
  ]);
});

test('ordine nel dettaglio: below-min, trend, ready-up', () => {
  const sessions = [
    sessionOf('A', day(0), { panca: lifts(60, 10, 10) }),
    sessionOf('A', day(2), { panca: lifts(70, 9, 7) }),
    sessionOf('A', day(4), { panca: lifts(75, 9, 7) }),
  ];
  assert.deepEqual(kinds(exerciseInsights(sessions, exercise('panca'), day(5))), ['below-min', 'progress']);
});

test('progressInsights: solo progress non entra nella pagina Progressi', () => {
  const sessions = [0, 2, 4].map((offset, index) => sessionOf('A', day(offset), { plank: hold(40 + index * 10) }));
  assert.deepEqual(kinds(exerciseInsights(sessions, exercise('plank'), day(5))), ['progress']);
  assert.deepEqual(progressInsights(program, sessions, day(5)).exercises, []);
});

test('progressInsights: il principale per priorità, solo esercizi in scheda con suggerimenti', () => {
  const retired = sessionOf('A', day(0), { panca: lifts(60, 10, 10) });
  retired.targets.stacco = { name: 'Stacco', type: 'weight', category: 'forza', sets: 1, reps: { min: 5, max: 5 } };
  retired.entries.stacco = lifts(100, 9);
  const sessions = [
    retired,
    sessionOf('A', day(2), { panca: lifts(70, 9, 7) }),
    sessionOf('A', day(4), { panca: lifts(75, 9, 7) }),
  ];
  const { exercises } = progressInsights(program, sessions, day(5));
  assert.deepEqual(exercises.map(({ exerciseId, name, top }) => [exerciseId, name, top.kind]), [['panca', 'Panca', 'below-min']]);
});

// Settimane: lunedì 31/8, 7/9, 14/9 di base, 21/9 la più recente completa; now giovedì 1/10.
const NOW = new Date(2026, 9, 1, 12);
const weekDay = (weekIndex, dayIndex) => day(-1 + weekIndex * 7 + dayIndex);
const weekSessions = (counts, weight = 50) =>
  counts.flatMap((count, weekIndex) =>
    Array.from({ length: count }, (_, dayIndex) => sessionOf('A', weekDay(weekIndex, dayIndex), { panca: lifts(weight, 10, 10) })),
  );
const globalKinds = (sessions) => kinds(globalInsights(program, sessions, NOW)).filter((kind) => kind !== 'workout-gap');

test('weekDay: la prima settimana di base parte lunedì 31 agosto', () => {
  assert.equal(weekDay(0, 0).getDay(), 1);
  assert.equal(weekDay(0, 0).getDate(), 31);
  assert.equal(weekDay(3, 0).getDate(), 21);
});

test('frequency-drop: ultima settimana completa ≤ media − 1, singolare e plurale', () => {
  const one = globalInsights(program, weekSessions([3, 3, 3, 1]), NOW).find((item) => item.kind === 'frequency-drop');
  assert.equal(one.text, 'Settimana scorsa 1 sessione, di solito 3: parlane col trainer');
  assert.equal(one.tone, 'attention');
  const two = globalInsights(program, weekSessions([3, 3, 3, 2]), NOW).find((item) => item.kind === 'frequency-drop');
  assert.equal(two.text, 'Settimana scorsa 2 sessioni, di solito 3: parlane col trainer');
  assert.ok(!globalKinds(weekSessions([3, 3, 3, 3])).includes('frequency-drop'));
});

test('frequenza e volume: servono 3 settimane complete di base', () => {
  // Storico dalla settimana del 7/9: base di 2 settimane soltanto.
  assert.deepEqual(globalKinds(weekSessions([0, 3, 3, 1])), []);
});

test('volume-up / volume-down: ±15% sulla media, volume-down soppresso da frequency-drop', () => {
  const base = weekSessions([1, 1, 1]);
  const recent = (weight) => [sessionOf('A', weekDay(3, 0), { panca: lifts(weight, 10, 10) })];
  const up = globalInsights(program, [...base, ...recent(57.5)], NOW).find((item) => item.kind === 'volume-up');
  assert.equal(up.text, 'Tonnellaggio +15% sulla media');
  const down = globalInsights(program, [...base, ...recent(42.5)], NOW).find((item) => item.kind === 'volume-down');
  assert.equal(down.text, 'Tonnellaggio −15% sulla media');
  assert.deepEqual(globalKinds([...base, ...recent(45)]), []);
  assert.deepEqual(globalKinds(weekSessions([3, 3, 3, 1])), ['frequency-drop']);
});

test('volume: nessun suggerimento se l\'ultima settimana completa non ha sessioni', () => {
  const lonely = [sessionOf('A', new Date(2026, 7, 3, 19), { panca: lifts(50, 10, 10) })];
  assert.deepEqual(globalKinds(lonely), []);
});

test('workout-gap: mai fatto per primo, poi per giorni; nessun gap se nessun altro allenamento è recente', () => {
  const sessions = [
    sessionOf('B', new Date(2026, 8, 1, 19)),
    sessionOf('B', new Date(2026, 8, 19, 19)),
    sessionOf('A', new Date(2026, 8, 29, 19)),
  ];
  const gaps = globalInsights(program, sessions, NOW).filter((item) => item.kind === 'workout-gap');
  assert.deepEqual(gaps.map(({ text, tone }) => [text, tone]), [
    ['Giorno 3 non ancora fatto', 'neutral'],
    ['Giorno 2 non fatto da 11 giorni', 'neutral'],
  ]);
  const allOld = [sessionOf('A', new Date(2026, 8, 1, 19)), sessionOf('B', new Date(2026, 8, 2, 19))];
  assert.deepEqual(kinds(globalInsights(program, allOld, NOW)).filter((kind) => kind === 'workout-gap'), []);
  const tooNew = [sessionOf('A', new Date(2026, 8, 29, 19))];
  assert.deepEqual(kinds(globalInsights(program, tooNew, NOW)), []);
});

test('globalInsights: ordine frequency-drop, workout-gap, volume', () => {
  const sessions = [...weekSessions([3, 3, 3, 1]), sessionOf('A', new Date(2026, 8, 30, 19))];
  const list = kinds(globalInsights(program, sessions, NOW));
  assert.equal(list[0], 'frequency-drop');
  assert.ok(list.slice(1).every((kind) => kind === 'workout-gap'));
});

// --- Garanzie trainer: storici generati sulla scheda reale -----------------------------------

const realProgram = normalizeProgram(JSON.parse(readFileSync(new URL('../data/program.json', import.meta.url), 'utf8')));

// PRNG deterministico (mulberry32): stessi storici a ogni esecuzione.
const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const FORBIDDEN = /scend|riduc|diminu|abbass|alleggerisc|deload/i;
const EFFORT_VALUES = ['facile', 'giusta', 'dura'];

// Una serie plausibile: a volte non fatta, ripetizioni dentro/sotto/sopra il range, peso che
// sale o scende (l'utente può non seguire le regole: i suggerimenti devono restare corretti).
const generatedSet = (random, target, weights, exerciseId) => {
  if (random() < 0.1) return { weight: null, reps: null, duration: null, effort: null };
  const effort = target.category === 'forza' ? EFFORT_VALUES[Math.floor(random() * 3)] : 'fatto';
  if (target.type === 'cardio') return { duration: 300 + Math.floor(random() * 900), effort: 'giusta' };
  const range = target.reps ?? target.duration;
  const top = range.max ?? range.min + 20;
  const count = Math.max(0, range.min - 3 + Math.floor(random() * (top - range.min + 7)));
  if (target.type === 'time') return { duration: count, effort };
  const step = random() < 0.15 ? -2.5 : random() < 0.3 ? 2.5 : 0;
  weights.set(exerciseId, Math.max(0, (weights.get(exerciseId) ?? (target.type === 'bodyweight' ? 0 : 20)) + step));
  return { weight: weights.get(exerciseId), reps: count, effort };
};

const generatedHistory = (seed) => {
  const random = prng(seed);
  const weights = new Map();
  const sessions = [];
  const count = Math.floor(random() * 40);
  let date = new Date(2026, 0, 5, 19);
  for (let index = 0; index < count; index += 1) {
    date = new Date(date);
    date.setDate(date.getDate() + 1 + Math.floor(random() * (random() < 0.15 ? 20 : 4)));
    const workout = realProgram.workouts[Math.floor(random() * realProgram.workouts.length)];
    const targets = {};
    const entries = {};
    workout.blocks.forEach((block) =>
      block.exercises.forEach(({ id, ...target }) => {
        targets[id] = target;
        entries[id] = Array.from({ length: target.sets }, () => generatedSet(random, target, weights, id));
      }),
    );
    sessions.push({
      id: `g${seed}-${index}`,
      workoutId: workout.id,
      workoutName: workout.name,
      startedAt: date.toISOString(),
      endedAt: date.toISOString(),
      bodyWeight: random() < 0.5 ? null : 70 + Math.floor(random() * 20),
      blocks: [],
      targets,
      entries,
    });
  }
  const now = new Date(date);
  now.setDate(now.getDate() + Math.floor(random() * 15));
  return { sessions, now };
};

const assertTrainerSafe = (item, context) => {
  assert.ok(Object.hasOwn(INSIGHT_KINDS, item.kind), `${context}: kind sconosciuto ${item.kind}`);
  assert.equal(item.tone, INSIGHT_KINDS[item.kind], `${context}: tono di ${item.kind}`);
  assert.doesNotMatch(item.text, FORBIDDEN, `${context}: ${item.text}`);
  if (item.tone === 'attention') assert.ok(item.text.endsWith(TRAINER_SUFFIX), `${context}: ${item.text}`);
  // Il segno meno solo davanti a una percentuale constatata.
  assert.ok([...item.text.matchAll(/−/g)].every((match) => /^−\d+%/.test(item.text.slice(match.index))), `${context}: ${item.text}`);
};

test('garanzie trainer su 300 storici generati dalla scheda reale', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed += 1) {
    const { sessions, now } = generatedHistory(seed);
    const { global, exercises } = progressInsights(realProgram, sessions, now);
    global.forEach((item) => {
      assertTrainerSafe(item, `seed ${seed}`);
      seen.add(item.kind);
    });
    programLoadExercises(realProgram).forEach((exerciseDef) => {
      const list = exerciseInsights(sessions, exerciseDef, now);
      list.forEach((item) => {
        assertTrainerSafe(item, `seed ${seed} ${exerciseDef.id}`);
        seen.add(item.kind);
      });
      const advice = loadAdvice(sessions, exerciseDef.id, exerciseDef);
      const readyUp = list.find((item) => item.kind === 'ready-up');
      const adviceUp = advice !== null && (advice.kind === 'up' || advice.kind === 'up-time');
      assert.equal(Boolean(readyUp), adviceUp, `seed ${seed} ${exerciseDef.id}: ready-up e loadAdvice discordi`);
      if (readyUp) assert.equal(readyUp.text, advice.text);
      const summary = exercises.find((item) => item.exerciseId === exerciseDef.id);
      const listed = list.some((item) => item.kind !== 'progress');
      assert.equal(Boolean(summary), listed, `seed ${seed} ${exerciseDef.id}: riepilogo`);
      if (summary) assert.notEqual(summary.top.kind, 'progress');
    });
  }
  // Il generatore deve esercitare ogni tipo, altrimenti il test non protegge nulla.
  assert.deepEqual([...seen].sort(), Object.keys(INSIGHT_KINDS).sort());
});

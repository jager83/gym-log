import { countKey, findWorkout } from './program.js';
import { isDone, round1 } from './metrics.js';

export const EFFORTS = ['facile', 'giusta', 'dura'];
export const EFFORT_LABELS = { facile: 'Facile', giusta: 'Giusta', dura: 'Dura' };
export const DONE_EFFORT = 'fatto';
export const STEPS = { weight: 0.5, reps: 1, duration: 5, distance: 0.1, level: 1, speed: 0.5 };
export const REST_ADJUST_SECONDS = 15;
export const REST_LIVE_GRACE_MS = 3000;

const isoAfter = (timeMs, seconds) => new Date(timeMs + seconds * 1000).toISOString();

const withSession = (state, patch) =>
  state.activeSession ? { ...state, activeSession: { ...state.activeSession, ...patch } } : state;

export const nextWorkoutId = (program, sessions) => {
  const last = sessions.at(-1);
  const index = last ? program.workouts.findIndex((workout) => workout.id === last.workoutId) : -1;
  if (index === -1) return program.workouts[0].id;
  return program.workouts[(index + 1) % program.workouts.length].id;
};

export const lastDoneByWorkout = (sessions) =>
  sessions.reduce((result, session) => ({ ...result, [session.workoutId]: session.endedAt }), {});

// Array posizionale completo (serie fatte e non) della sessione terminata più recente con
// almeno una serie fatta di quell'esercizio; null se nessuna sessione lo contiene fatto.
export const lastDoneSets = (sessions, exerciseId) => {
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const sets = sessions[index].entries[exerciseId];
    if (sets && sets.some(isDone)) return sets;
  }
  return null;
};

// Serie da cui precompilare l'indice setIndex: stessa posizione se fatta; altrimenti l'ultima
// fatta con indice minore; se non ce n'è, la prima fatta con indice maggiore; oltre la
// lunghezza di previous, l'ultima serie fatta.
export const sourceSet = (previous, setIndex) => {
  if (!previous) return null;
  if (setIndex >= previous.length) {
    for (let index = previous.length - 1; index >= 0; index -= 1) {
      if (isDone(previous[index])) return previous[index];
    }
    return null;
  }
  if (isDone(previous[setIndex])) return previous[setIndex];
  for (let index = setIndex - 1; index >= 0; index -= 1) {
    if (isDone(previous[index])) return previous[index];
  }
  for (let index = setIndex + 1; index < previous.length; index += 1) {
    if (isDone(previous[index])) return previous[index];
  }
  return null;
};

const prefillSet = (exercise, previous, setIndex) => {
  if (exercise.type === 'cardio') {
    return { duration: exercise.duration?.max ?? null, distance: null, level: null, speed: null, effort: null };
  }
  const source = sourceSet(previous, setIndex);
  const key = countKey(exercise.type);
  const set = { [key]: exercise[key].max, effort: null };
  if (exercise.type === 'weight') set.weight = source?.weight ?? null;
  if (exercise.type === 'bodyweight') set.weight = source?.weight ?? 0;
  return set;
};

export const startSession = (program, state, workoutId, now) => {
  if (state.activeSession) throw new Error('Sessione già aperta');
  const workout = findWorkout(program, workoutId);
  if (!workout) throw new Error(`Allenamento sconosciuto: ${workoutId}`);

  const blocks = [];
  const targets = {};
  const entries = {};
  workout.blocks.forEach((block) => {
    blocks.push({ rest: block.rest, phase: block.phase ?? null, exerciseIds: block.exercises.map((exercise) => exercise.id) });
    block.exercises.forEach((exercise) => {
      const { id, ...target } = exercise;
      const key = countKey(exercise.type);
      targets[id] = { ...target, [key]: exercise[key] ? { ...exercise[key] } : null };
      const previous = lastDoneSets(state.sessions, id);
      entries[id] = Array.from({ length: exercise.sets }, (_, setIndex) => prefillSet(exercise, previous, setIndex));
    });
  });

  return {
    ...state,
    activeSession: {
      id: `s_${now.getTime().toString(36)}`,
      workoutId,
      workoutName: workout.name,
      programVersion: program.version,
      startedAt: now.toISOString(),
      restEndsAt: null,
      restBlockIndex: null,
      timer: null,
      bodyWeight: state.settings.bodyWeight ?? null,
      blocks,
      targets,
      entries,
    },
  };
};

export const interleaveSets = (block, targets) => {
  const rounds = Math.max(...block.exerciseIds.map((exerciseId) => targets[exerciseId].sets));
  const order = [];
  for (let setIndex = 0; setIndex < rounds; setIndex += 1) {
    block.exerciseIds.forEach((exerciseId) => {
      if (setIndex < targets[exerciseId].sets) order.push({ exerciseId, setIndex });
    });
  }
  return order;
};

const blockIndexOf = (session, exerciseId) => session.blocks.findIndex((block) => block.exerciseIds.includes(exerciseId));

// Vero alla fine di ogni giro del blocco (blocco singolo: ogni serie; superset: l'ultimo
// esercizio del giro), inclusa l'ultima serie del blocco. Falso solo per l'ultima serie
// dell'ultimo blocco della sessione (fine allenamento) e per esercizi/serie inesistenti.
export const shouldStartRest = (session, exerciseId, setIndex) => {
  const blockIndex = blockIndexOf(session, exerciseId);
  if (blockIndex === -1) return false;
  const block = session.blocks[blockIndex];
  const order = interleaveSets(block, session.targets);
  const position = order.findIndex((item) => item.exerciseId === exerciseId && item.setIndex === setIndex);
  if (position === -1) return false;
  if (position === order.length - 1) return blockIndex !== session.blocks.length - 1;
  return order[position + 1].setIndex !== setIndex;
};

export const clampValue = (field, value) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (field === 'weight') return Math.max(0, Math.round(value * 2) / 2);
  if (field === 'distance') return Math.max(0, Math.round(value * 100) / 100);
  if (field === 'speed') return Math.max(0, Math.round(value * 10) / 10);
  return Math.max(0, Math.round(value));
};

export const stepValue = (field, value, direction) => clampValue(field, (value ?? 0) + direction * STEPS[field]);

// L'effort DONE_EFFORT ('fatto') vale solo per gli esercizi con category diversa da forza
// (stretching/mobilita): per forza restano ammessi solo gli EFFORTS (faccine).
const isValidEffort = (value, category) => EFFORTS.includes(value) || (category !== 'forza' && value === DONE_EFFORT);

const applyPatch = (set, patch, category) =>
  Object.entries(patch).reduce(
    (next, [field, value]) => ({
      ...next,
      [field]: field === 'effort' ? (isValidEffort(value, category) ? value : null) : clampValue(field, value),
    }),
    set,
  );

export const updateSet = (state, exerciseId, setIndex, patch, now) => {
  const session = state.activeSession;
  const current = session?.entries[exerciseId]?.[setIndex];
  if (!current) return state;

  const category = session.targets[exerciseId].category ?? 'forza';
  const next = applyPatch(current, patch, category);
  const sets = session.entries[exerciseId].map((set, index) => (index === setIndex ? next : set));
  const blockIndex = blockIndexOf(session, exerciseId);

  // Un recupero attivo si chiude prima di applicare la patch: se la serie modificata appartiene
  // a un blocco diverso da quello in recupero (qualunque campo), o se la patch segna la fatica
  // (null -> valore, qualunque blocco: si sta chiudendo una serie mentre si riposava un'altra).
  const marksEffort = current.effort === null && next.effort !== null;
  const closesRest = session.restEndsAt !== null && (marksEffort || blockIndex !== session.restBlockIndex);

  // Poi si applica C1: se la serie appena segnata chiude un giro, parte il recupero nuovo
  // (vince su closesRest: si può chiudere il vecchio recupero e aprirne subito uno nuovo).
  const startsRest = !isDone(current) && isDone(next) && shouldStartRest(session, exerciseId, setIndex);

  return withSession(state, {
    restEndsAt: startsRest
      ? isoAfter(now.getTime(), session.blocks[blockIndex].rest)
      : closesRest ? null : session.restEndsAt,
    restBlockIndex: startsRest ? blockIndex : closesRest ? null : session.restBlockIndex,
    entries: { ...session.entries, [exerciseId]: sets },
  });
};

export const currentBlockIndex = (session) => {
  const index = session.blocks.findIndex((block) =>
    block.exerciseIds.some((exerciseId) => !session.entries[exerciseId].every(isDone)),
  );
  return index === -1 ? session.blocks.length - 1 : index;
};

export const startRest = (state, seconds, now, blockIndex) =>
  withSession(state, { restEndsAt: isoAfter(now.getTime(), seconds), restBlockIndex: blockIndex });

// Mantiene restBlockIndex: si sta solo allungando il recupero in corso, il blocco non cambia.
export const extendRest = (state, seconds) => {
  const endsAt = state.activeSession?.restEndsAt;
  if (!endsAt) return state;
  return withSession(state, { restEndsAt: isoAfter(Date.parse(endsAt), seconds) });
};

export const clearRest = (state) => withSession(state, { restEndsAt: null, restBlockIndex: null });

export const restRemainingMs = (session, now) =>
  session?.restEndsAt ? Math.max(0, Date.parse(session.restEndsAt) - now.getTime()) : 0;

export const restStatus = (session, now) => {
  if (!session?.restEndsAt) return 'idle';
  const overdue = now.getTime() - Date.parse(session.restEndsAt);
  if (overdue < 0) return 'running';
  return overdue <= REST_LIVE_GRACE_MS ? 'expired-live' : 'expired-stale';
};

export const hasDoneSets = (session) => Object.values(session.entries).some((sets) => sets.some(isDone));

export const discardSession = (state) => ({ ...state, activeSession: null });

export const finishSession = (state, now) => {
  const session = state.activeSession;
  if (!session) return state;
  if (!hasDoneSets(session)) return discardSession(state);
  return {
    ...state,
    activeSession: null,
    sessions: [...state.sessions, { ...session, restEndsAt: null, restBlockIndex: null, timer: null, endedAt: now.toISOString() }],
  };
};

export const setSound = (state, enabled) => ({ ...state, settings: { ...state.settings, sound: enabled } });

// "Lati di seguito": il lato 2 parte da solo dopo il cambio lato (assente = true, vedi timer.js).
export const setSidesAuto = (state, enabled) => ({ ...state, settings: { ...state.settings, sidesAuto: enabled } });

export const setBodyWeight = (state, value) => {
  const bodyWeight = typeof value === 'number' && Number.isFinite(value) && value > 0 ? round1(value) : null;
  return { ...state, settings: { ...state.settings, bodyWeight } };
};

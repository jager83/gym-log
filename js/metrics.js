import { countKey } from './program.js';

export const METRIC_LABELS = {
  weight: '1RM stimato (kg)',
  bodyweight: 'Ripetizioni massime',
  time: 'Durata massima (s)',
};

export const isDone = (set) => set.effort !== null && set.effort !== undefined;

export const round1 = (value) => Math.round(value * 10) / 10;

export const epley = (weight, reps) => round1(weight * (1 + reps / 30));

export const setOutcome = (set, type, target) => {
  if (!isDone(set)) return null;
  const count = set[countKey(type)];
  if (typeof count !== 'number') return null;
  if (count < target.min) return 'fallita';
  if (count > target.max) return 'carico-basso';
  return 'ok';
};

const setMetric = (set, type) => {
  if (type === 'weight') {
    return typeof set.weight === 'number' && typeof set.reps === 'number' ? epley(set.weight, set.reps) : null;
  }
  const value = set[countKey(type)];
  return typeof value === 'number' ? value : null;
};

export const sessionMetric = (sets, type) => {
  const values = sets
    .filter(isDone)
    .map((set) => setMetric(set, type))
    .filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
};

export const exerciseHistory = (sessions, exerciseId) =>
  sessions
    .filter((session) => session.entries[exerciseId]?.some(isDone))
    .map((session) => {
      const target = session.targets[exerciseId];
      const sets = session.entries[exerciseId];
      return {
        sessionId: session.id,
        date: session.endedAt,
        name: target.name,
        type: target.type,
        target: target[countKey(target.type)],
        sets: sets.filter(isDone),
        value: sessionMetric(sets, target.type),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

export const retiredExercises = (program, sessions) => {
  const inProgram = new Set(
    program.workouts.flatMap((workout) => workout.blocks.flatMap((block) => block.exercises.map((exercise) => exercise.id))),
  );
  const retired = new Map();
  sessions.forEach((session) => {
    Object.keys(session.entries).forEach((exerciseId) => {
      if (!inProgram.has(exerciseId)) retired.set(exerciseId, session.targets[exerciseId].name);
    });
  });
  return [...retired].map(([id, name]) => ({ id, name }));
};

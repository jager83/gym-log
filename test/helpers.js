import { finishSession, startSession, updateSet } from '../js/session.js';
import { at } from './fixtures.js';

export const emptyState = () => ({
  schemaVersion: 1,
  settings: { sound: true },
  lastExportAt: null,
  activeSession: null,
  sessions: [],
});

export const playSession = (program, state, workoutId, sets, startIso, endIso) => {
  let next = startSession(program, state, workoutId, at(startIso));
  Object.entries(sets).forEach(([exerciseId, patches]) => {
    patches.forEach((patch, setIndex) => {
      next = updateSet(next, exerciseId, setIndex, patch, at(startIso));
    });
  });
  return finishSession(next, at(endIso));
};

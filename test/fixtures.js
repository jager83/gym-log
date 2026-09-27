import { normalizeProgram } from '../js/program.js';

export const rawProgram = () => ({
  version: 2,
  defaultSets: 3,
  defaultRest: 90,
  workouts: [
    {
      id: 'A',
      name: 'Allenamento A',
      blocks: [
        { rest: 120, exercises: [{ id: 'panca', name: 'Panca piana', type: 'weight', reps: { min: 8, max: 10 } }] },
        {
          exercises: [
            { id: 'curl', name: 'Curl', type: 'weight', reps: { min: 10, max: 12 } },
            { id: 'trazioni', name: 'Trazioni', type: 'bodyweight', sets: 4, reps: 8 },
          ],
        },
      ],
    },
    {
      id: 'B',
      name: 'Allenamento B',
      blocks: [
        { exercises: [{ id: 'panca', name: 'Panca piana', type: 'weight', sets: 4, reps: { min: 6, max: 8 } }] },
        { exercises: [{ id: 'plank', name: 'Plank', type: 'time', duration: { min: 45, max: 60 } }] },
      ],
    },
    {
      id: 'C',
      name: 'Allenamento C',
      blocks: [{ exercises: [{ id: 'squat', name: 'Squat', type: 'weight', reps: { min: 8, max: 10 } }] }],
    },
  ],
});

export const program = () => normalizeProgram(rawProgram());

export const at = (iso) => new Date(iso);

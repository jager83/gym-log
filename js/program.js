export const EXERCISE_TYPES = ['weight', 'bodyweight', 'time', 'cardio'];
export const LOAD_VALUES = ['total', 'per-dumbbell'];
export const CATEGORIES = ['forza', 'stretching', 'mobilita'];
export const PHASES = ['riscaldamento', 'defaticamento'];

const DEFAULTS = { version: 1, defaultSets: 3, defaultRest: 90 };

export class ProgramError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProgramError';
  }
}

const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

const requirePositiveInt = (value, label) => {
  if (!isPositiveInt(value)) throw new ProgramError(`${label} deve essere intero > 0`);
  return value;
};

export const countKey = (type) => (type === 'time' || type === 'cardio' ? 'duration' : 'reps');

export const isTextArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');

const normalizeRange = (value, label) => {
  const range = typeof value === 'number' ? { min: value, max: value } : value;
  if (!range || typeof range !== 'object') throw new ProgramError(`${label}: range mancante`);
  if (!isPositiveInt(range.min) || !isPositiveInt(range.max)) {
    throw new ProgramError(`${label}: min e max devono essere interi > 0`);
  }
  if (range.min > range.max) throw new ProgramError(`${label}: min maggiore di max`);
  return { min: range.min, max: range.max };
};

const normalizeExercise = (raw, defaultSets, seen) => {
  if (!raw || typeof raw.id !== 'string' || raw.id === '') throw new ProgramError('esercizio senza id');
  const label = `esercizio ${raw.id}`;
  if (typeof raw.name !== 'string' || raw.name === '') throw new ProgramError(`${label}: name mancante`);
  if (!EXERCISE_TYPES.includes(raw.type)) throw new ProgramError(`${label}: type sconosciuto "${raw.type}"`);

  if (raw.load !== undefined && raw.type !== 'weight') {
    throw new ProgramError(`${label}: load ammesso solo per type weight`);
  }
  let load;
  if (raw.type === 'weight') {
    load = raw.load ?? 'total';
    if (!LOAD_VALUES.includes(load)) throw new ProgramError(`${label}: load sconosciuto "${raw.load}"`);
  }

  const sides = raw.sides ?? 1;
  if (sides !== 1 && sides !== 2) throw new ProgramError(`${label}: sides deve essere 1 o 2`);

  const category = raw.category ?? 'forza';
  if (!CATEGORIES.includes(category)) throw new ProgramError(`${label}: category sconosciuta "${raw.category}"`);
  if (category !== 'forza' && raw.type !== 'time' && raw.type !== 'bodyweight') {
    throw new ProgramError(`${label}: category ${category} ammessa solo per time o bodyweight`);
  }

  if (raw.description !== undefined && typeof raw.description !== 'string') {
    throw new ProgramError(`${label}: description non valida`);
  }
  if (raw.steps !== undefined && !isTextArray(raw.steps)) throw new ProgramError(`${label}: steps non valido`);
  if (raw.tips !== undefined && !isTextArray(raw.tips)) throw new ProgramError(`${label}: tips non valido`);

  const previous = seen.get(raw.id);
  if (
    previous &&
    (previous.name !== raw.name ||
      previous.type !== raw.type ||
      previous.load !== load ||
      previous.category !== category ||
      previous.sides !== sides)
  ) {
    throw new ProgramError(`id duplicato: ${raw.id}`);
  }

  const sets = requirePositiveInt(raw.sets ?? defaultSets, `${label}: sets`);
  const key = countKey(raw.type);
  let target;
  if (raw.type === 'cardio') {
    target = raw.duration !== undefined ? normalizeRange(raw.duration, `${label}: duration`) : null;
  } else {
    if (raw[key] === undefined) throw new ProgramError(`${label}: ${key} mancante`);
    target = normalizeRange(raw[key], `${label}: ${key}`);
  }

  const exercise = {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    category,
    sides,
    sets,
    [key]: target,
    ...(raw.type === 'weight' ? { load } : {}),
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.steps !== undefined ? { steps: raw.steps } : {}),
    ...(raw.tips !== undefined ? { tips: raw.tips } : {}),
  };
  seen.set(raw.id, exercise);
  return exercise;
};

const normalizeWorkout = (raw, defaults, seenWorkouts, seenExercises) => {
  if (!raw || typeof raw.id !== 'string' || raw.id === '') throw new ProgramError('allenamento senza id');
  if (seenWorkouts.has(raw.id)) throw new ProgramError(`id allenamento duplicato: ${raw.id}`);
  seenWorkouts.add(raw.id);

  const label = `allenamento ${raw.id}`;
  if (typeof raw.name !== 'string' || raw.name === '') throw new ProgramError(`${label}: name mancante`);
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) throw new ProgramError(`${label}: blocks vuoto`);

  const inWorkout = new Set();
  const blocks = raw.blocks.map((block, index) => {
    const blockLabel = `${label}, blocco ${index + 1}`;
    if (!block || !Array.isArray(block.exercises) || block.exercises.length === 0) {
      throw new ProgramError(`${blockLabel}: exercises vuoto`);
    }
    const rest = requirePositiveInt(block.rest ?? defaults.defaultRest, `${blockLabel}: rest`);
    const phase = block.phase ?? null;
    if (block.phase !== undefined && !PHASES.includes(block.phase)) {
      throw new ProgramError(`${blockLabel}: phase sconosciuta "${block.phase}"`);
    }
    const exercises = block.exercises.map((rawExercise) => {
      const exercise = normalizeExercise(rawExercise, defaults.defaultSets, seenExercises);
      if (inWorkout.has(exercise.id)) throw new ProgramError(`id duplicato: ${exercise.id}`);
      inWorkout.add(exercise.id);
      return exercise;
    });
    return { rest, phase, exercises };
  });

  return { id: raw.id, name: raw.name, blocks };
};

export const normalizeProgram = (raw) => {
  if (!raw || typeof raw !== 'object') throw new ProgramError('scheda non valida');

  const version = requirePositiveInt(raw.version ?? DEFAULTS.version, 'version');
  const defaultSets = requirePositiveInt(raw.defaultSets ?? DEFAULTS.defaultSets, 'defaultSets');
  const defaultRest = requirePositiveInt(raw.defaultRest ?? DEFAULTS.defaultRest, 'defaultRest');
  if (!Array.isArray(raw.workouts) || raw.workouts.length === 0) throw new ProgramError('workouts vuoto');

  const seenWorkouts = new Set();
  const seenExercises = new Map();
  const workouts = raw.workouts.map((workout) =>
    normalizeWorkout(workout, { defaultSets, defaultRest }, seenWorkouts, seenExercises),
  );

  propagateTexts(workouts);

  return { version, defaultSets, defaultRest, workouts };
};

const TEXT_FIELDS = ['description', 'steps', 'tips'];

const forEachExercise = (workouts, callback) => {
  for (const workout of workouts) {
    for (const block of workout.blocks) {
      for (const exercise of block.exercises) callback(exercise);
    }
  }
};

const propagateTexts = (workouts) => {
  const firstTexts = new Map();
  forEachExercise(workouts, (exercise) => {
    const entry = firstTexts.get(exercise.id) ?? {};
    for (const field of TEXT_FIELDS) {
      if (entry[field] === undefined && exercise[field] !== undefined) entry[field] = exercise[field];
    }
    firstTexts.set(exercise.id, entry);
  });
  forEachExercise(workouts, (exercise) => {
    const entry = firstTexts.get(exercise.id);
    for (const field of TEXT_FIELDS) {
      if (entry[field] !== undefined) exercise[field] = entry[field];
    }
  });
};

export const parseProgram = (text) => {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProgramError('JSON non valido');
  }
  return normalizeProgram(raw);
};

export const loadProgram = async (fetchFn = fetch, url = 'data/program.json') => {
  let response;
  try {
    response = await fetchFn(url);
  } catch {
    throw new ProgramError('Serve la connessione al primo avvio');
  }
  if (!response.ok) throw new ProgramError(`program.json non raggiungibile (HTTP ${response.status})`);
  return parseProgram(await response.text());
};

export const findWorkout = (program, workoutId) => program.workouts.find((workout) => workout.id === workoutId) ?? null;

export const findExercise = (program, exerciseId) => {
  for (const workout of program.workouts) {
    for (const block of workout.blocks) {
      const exercise = block.exercises.find((item) => item.id === exerciseId);
      if (exercise) return exercise;
    }
  }
  return null;
};

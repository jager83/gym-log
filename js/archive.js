// Archivio delle schede precedenti: file statici in data/archive/, elencati da index.json.
import { loadProgram } from './program.js';

const ARCHIVE_DIR = 'data/archive';
const ENTRY_TEXT_FIELDS = ['name', 'from', 'to', 'file'];

const isEntry = (entry) =>
  Boolean(entry) &&
  Number.isInteger(entry.version) &&
  ENTRY_TEXT_FIELDS.every((field) => typeof entry[field] === 'string' && entry[field] !== '');

export const loadArchiveIndex = async (fetchFn = fetch, url = `${ARCHIVE_DIR}/index.json`) => {
  try {
    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const index = JSON.parse(await response.text());
    if (!Array.isArray(index) || !index.every(isEntry)) throw new Error('indice non valido');
    return index;
  } catch {
    throw new Error('Archivio schede non disponibile');
  }
};

export const loadArchivedProgram = (entry, fetchFn = fetch) => loadProgram(fetchFn, `${ARCHIVE_DIR}/${entry.file}`);

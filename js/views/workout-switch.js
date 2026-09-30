// Sostituire la sessione attiva con un altro allenamento: messaggio di scarto e conferma,
// condivisi tra la home (scheda di un altro allenamento) e l'anteprima ("Inizia" con una sessione
// già in corso).
import { isDone } from '../metrics.js';
import { confirmDialog } from './modal.js';

// Messaggio di scarto: avvisa quante serie segnate andranno perse.
export const discardMessage = (session) => {
  const count = Object.values(session.entries).flat().filter(isDone).length;
  if (count === 0) return 'I dati inseriti andranno persi.';
  return `Hai ${count} ${count === 1 ? 'serie segnata' : 'serie segnate'} in ${session.workoutName}: andranno perse.`;
};

// Conferma per scartare `active` e iniziare `nextName` al suo posto.
export const confirmSwitchWorkout = (nextName, active) =>
  confirmDialog({
    title: `Iniziare ${nextName}?`,
    message: `Hai ${active.workoutName} in corso: verrà scartato. ${discardMessage(active)}`,
    confirmLabel: 'Scarta e inizia',
    danger: true,
  });

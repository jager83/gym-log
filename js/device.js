export const keepScreenOn = (onUnavailable) => {
  if (!('wakeLock' in navigator)) {
    onUnavailable();
    return;
  }
  let lock = null;
  const request = async () => {
    if (document.visibilityState !== 'visible' || lock) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch {
      onUnavailable();
    }
  };
  document.addEventListener('visibilitychange', request);
  request();
};

export const vibrate = (pattern) => {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
};

let audioContext = null;

// L'AudioContext si può avviare solo dopo un gesto dell'utente: si (ri)attiva a ogni tap.
export const unlockAudio = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  document.addEventListener('pointerdown', () => {
    audioContext = audioContext ?? new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
  });
};

export const beep = () => {
  if (!audioContext || audioContext.state !== 'running') return;
  [0, 0.25].forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 880;
    gain.gain.value = 0.2;
    oscillator.connect(gain).connect(audioContext.destination);
    const start = audioContext.currentTime + offset;
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  });
};

export const downloadText = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

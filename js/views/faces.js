const MOUTHS = {
  facile: 'M8 14c1.2 1.6 2.5 2.4 4 2.4s2.8-.8 4-2.4',
  giusta: 'M8.5 15h7',
  dura: 'M8 16.4c1.2-1.6 2.5-2.4 4-2.4s2.8.8 4 2.4',
};

export const faceSvg = (effort) =>
  `<svg class="face face--${effort}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` +
  '<circle class="face__head" cx="12" cy="12" r="10"/>' +
  '<circle class="face__eye" cx="9" cy="10" r="1.2"/>' +
  '<circle class="face__eye" cx="15" cy="10" r="1.2"/>' +
  `<path class="face__mouth" d="${MOUTHS[effort]}"/>` +
  '</svg>';

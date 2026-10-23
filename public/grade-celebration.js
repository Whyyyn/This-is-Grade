export function isPerfectNewGrade(change) {
  return change?.type === 'new-assignment' && change.newItem?.scorePercent === 100;
}

/** Celebrate each perfect new grade once per reveal dialog, including reveal-all. */
export function createGradeCelebration() {
  const celebrated = new Set();
  let overlay;
  let dismissTimer;

  function dismiss() {
    clearTimeout(dismissTimer);
    overlay?.remove();
    overlay = null;
  }

  function reveal(changes) {
    const perfect = changes.filter((change) => isPerfectNewGrade(change) && !celebrated.has(change));
    if (!perfect.length) return;
    perfect.forEach((change) => celebrated.add(change));
    dismiss();

    overlay = document.createElement('div');
    overlay.className = 'grade-celebration';

    const message = document.createElement('div');
    message.className = 'grade-celebration-message';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.setAttribute('aria-atomic', 'true');
    const artwork = document.createElement('img');
    artwork.className = 'grade-celebration-artwork';
    artwork.alt = '100% — congrats!';
    artwork.src = new URL('./assets/perfect-grade-congrats.png', import.meta.url).href;
    artwork.width = 2000;
    artwork.height = 2000;
    artwork.draggable = false;
    message.append(artwork);

    // Reduced-motion users still see the message, without flying confetti.
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const colors = ['#f9c74f', '#43d9ad', '#78a9ff', '#ff8faa', '#ba9aff', '#ffffff'];
      const confetti = document.createElement('div');
      confetti.className = 'grade-celebration-confetti';
      confetti.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < 84; index++) {
        const piece = document.createElement('i');
        const direction = index % 2 === 0 ? 1 : -1;
        const drift = direction * (12 + Math.random() * 48);
        piece.className = 'grade-confetti-piece';
        piece.style.cssText = `
          left: ${direction === 1 ? 12 : 88}%;
          --confetti-color: ${colors[index % colors.length]};
          --confetti-drift-mid: ${drift * 0.7}vw;
          --confetti-drift-end: ${drift}vw;
          --confetti-lift: ${-38 - Math.random() * 40}vh;
          --confetti-fall: ${42 + Math.random() * 24}vh;
          --confetti-spin: ${direction * (360 + Math.random() * 720)}deg;
          --confetti-delay: ${Math.random() * 180}ms;
          --confetti-duration: ${2900 + Math.random() * 700}ms;
          width: ${5 + Math.random() * 5}px;
          height: ${6 + Math.random() * 9}px;
          border-radius: ${index % 3 === 0 ? '50%' : '2px'};
        `;
        confetti.append(piece);
      }
      overlay.append(confetti);
    }

    overlay.append(message);
    document.body.append(overlay);
    dismissTimer = setTimeout(dismiss, 4200);
  }

  return {
    reveal,
    dismiss,
    reset() {
      dismiss();
      celebrated.clear();
    }
  };
}

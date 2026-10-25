const dialog = document.querySelector<HTMLDialogElement>('dialog.vmodal');
const video = dialog?.querySelector<HTMLVideoElement>('video');
const closeBtn = dialog?.querySelector<HTMLButtonElement>('.vmodal-close');

if (dialog && video) {
  const MOVE_LIMIT = 10;
  let opener: HTMLElement | null = null;
  let downX = 0;
  let downY = 0;

  const setScroll = (locked: boolean) => {
    const v = locked ? 'hidden' : '';
    document.documentElement.style.overflow = v;
    document.body.style.overflow = v;
  };

  document.querySelectorAll<HTMLButtonElement>('.gcard-open').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    btn.addEventListener('click', (e) => {
      // Keyboard clicks have detail 0 and no pointer movement to judge.
      if (e.detail > 0 && Math.hypot(e.clientX - downX, e.clientY - downY) > MOVE_LIMIT) return;
      opener = btn;
      video.src = btn.dataset.video ?? '';
      setScroll(true);
      dialog.showModal();
      video.play().catch(() => {});
    });
  });

  closeBtn?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    setScroll(false);
    opener?.focus();
    opener = null;
  });
}

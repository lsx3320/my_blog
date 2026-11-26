// Phones clear :active on finger-up, and the native tap flash is disabled.
// Hold a pressed style from pointer-down until the next page is actually in,
// and show a top bar as soon as navigation starts — before the fetch finishes.
const MOVE_CANCEL = 12;
const FAST_HIDE_MS = 140;

type Modifiers = Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;
type PrepEvent = Event & { sourceElement?: EventTarget | null };

const bar = document.getElementById('nav-progress');
const fill = bar?.querySelector('span');
if (bar && fill instanceof HTMLElement && !bar.dataset.bound) {
  bar.dataset.bound = 'true';
  install(bar, fill);
}

function install(progress: HTMLElement, progressFill: HTMLElement) {
  let pressed: HTMLAnchorElement | null = null;
  let navigating = false;
  let originX = 0;
  let originY = 0;
  let generation = 0;
  let startedAt = 0;
  let trickle = 0;
  let hideTimer = 0;
  let failSafe = 0;
  let releaseTimer = 0;

  const setPressed = (link: HTMLAnchorElement | null) => {
    if (pressed === link) return;
    pressed?.classList.remove('is-pressed');
    pressed = link;
    link?.classList.add('is-pressed');
  };

  const startBar = () => {
    const gen = ++generation;
    window.clearInterval(trickle);
    window.clearTimeout(hideTimer);
    window.clearTimeout(failSafe);
    navigating = true;
    startedAt = performance.now();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let value = reduce ? 1 : 0.18;
    progress.classList.add('is-active');
    progressFill.style.transition = 'none';
    progressFill.style.transform = `scaleX(${value})`;
    void progressFill.offsetWidth;
    progressFill.style.transition = '';
    document.documentElement.setAttribute('aria-busy', 'true');
    if (!reduce) {
      trickle = window.setInterval(() => {
        value += Math.max(0.012, (0.9 - value) * 0.08);
        if (value > 0.9) value = 0.9;
        progressFill.style.transform = `scaleX(${value})`;
      }, 180);
    }
    failSafe = window.setTimeout(() => finish(gen), 12000);
  };

  const finish = (gen = generation) => {
    if (gen !== generation) return;
    window.clearInterval(trickle);
    window.clearTimeout(failSafe);
    navigating = false;
    setPressed(null);
    document.documentElement.removeAttribute('aria-busy');
    if (!progress.classList.contains('is-active')) return;
    const shownFor = performance.now() - startedAt;
    if (shownFor < FAST_HIDE_MS) {
      progress.classList.remove('is-active');
      progressFill.style.transform = 'scaleX(0)';
      return;
    }
    progressFill.style.transform = 'scaleX(1)';
    hideTimer = window.setTimeout(() => {
      if (gen !== generation) return;
      progress.classList.remove('is-active');
      window.setTimeout(() => {
        if (gen !== generation) return;
        progressFill.style.transform = 'scaleX(0)';
      }, 200);
    }, 160);
  };

  const remember = (link: HTMLAnchorElement) => {
    window.clearTimeout(releaseTimer);
    setPressed(link);
  };

  document.addEventListener('touchstart', () => {}, { passive: true });

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const link = anchorFrom(event.target);
    if (!link || !isPageNavigation(link, event)) return;
    remember(link);
    originX = event.clientX;
    originY = event.clientY;
  }, { capture: true, passive: true });

  document.addEventListener('pointermove', (event) => {
    if (!pressed || navigating) return;
    if (Math.hypot(event.clientX - originX, event.clientY - originY) > MOVE_CANCEL) setPressed(null);
  }, { capture: true, passive: true });

  document.addEventListener('pointercancel', () => {
    if (!navigating) setPressed(null);
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', () => {
    if (!pressed || navigating) return;
    const link = pressed;
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      if (pressed === link && !navigating) setPressed(null);
    }, 80);
  }, { capture: true, passive: true });

  document.addEventListener('astro:before-preparation', (event) => {
    const source = (event as PrepEvent).sourceElement;
    if (source instanceof HTMLAnchorElement) remember(source);
    startBar();
  });

  document.addEventListener('click', (event) => {
    const link = anchorFrom(event.target);
    if (!link) return;
    window.setTimeout(() => {
      if (navigating) return;
      if (event.defaultPrevented || !isPageNavigation(link, event)) {
        if (pressed === link) setPressed(null);
        return;
      }
      remember(link);
      startBar();
    }, 0);
  });

  // after-swap only fires once the next document is in, not on the first load.
  document.addEventListener('astro:after-swap', () => finish());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) finish();
  });
}

function pathOf(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

function isPageNavigation(link: HTMLAnchorElement, event?: Modifiers) {
  if (event) {
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  }
  if (link.target && link.target !== '_self') return false;
  if (link.hasAttribute('download')) return false;
  const raw = link.getAttribute('href');
  if (!raw || /^(?:mailto:|tel:|javascript:)/i.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return false;
  }
  if (url.origin !== location.origin) return false;
  return !(pathOf(url.pathname) === pathOf(location.pathname) && url.search === location.search);
}

function anchorFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const link = target.closest('a[href]');
  return link instanceof HTMLAnchorElement ? link : null;
}

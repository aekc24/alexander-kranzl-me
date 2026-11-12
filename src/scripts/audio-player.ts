import { t } from '../i18n/ui';
import { normalizeNarrationText, type Narration } from '../utils/narration';

let disposePlayer: (() => void) | undefined;
let currentRoot: HTMLElement | null = null;

function setupAudioPlayer() {
  const root = document.getElementById('audio-player-root');
  if (root && root === currentRoot) return;
  disposePlayer?.();
  currentRoot = root;
  if (!root) return;

  const audio = root.querySelector<HTMLAudioElement>('audio');
  const narration: Narration | null = JSON.parse(root.dataset.narration || 'null');
  const status = root.querySelector<HTMLElement>('#audio-status-badge');
  if (!audio || !narration?.sections.length) {
    if (status) status.textContent = t('audio.unavailable');
    return;
  }
  const sections = narration.sections;
  const controller = new AbortController();
  const { signal } = controller;
  const play = root.querySelector<HTMLButtonElement>('#audio-play-btn')!;
  const stop = root.querySelector<HTMLButtonElement>('#audio-stop-btn')!;
  const previous = root.querySelector<HTMLButtonElement>('#audio-prev-btn')!;
  const next = root.querySelector<HTMLButtonElement>('#audio-next-btn')!;
  const rate = root.querySelector<HTMLButtonElement>('#audio-rate-btn')!;
  const toggle = root.querySelector<HTMLButtonElement>('#audio-toggle-btn')!;
  const drawer = root.querySelector<HTMLElement>('#audio-player-drawer')!;
  const error = root.querySelector<HTMLElement>('#audio-error')!;
  const progress = root.querySelector<HTMLElement>('.audio-progress-bar')!;
  const fill = root.querySelector<HTMLElement>('#audio-progress-fill')!;
  const estimate = root.querySelector<HTMLElement>('#audio-estimate')!;
  const position = root.querySelector<HTMLElement>('#audio-part-label')!;
  const percentage = root.querySelector<HTMLElement>('#audio-pct-label')!;
  const playText = root.querySelector<HTMLElement>('#audio-play-text')!;
  const rates = [1, 1.25, 1.5, 2, 0.75];
  let rateIndex = 0;
  let sectionIndex = 0;
  let requestedSeek: number | null = null;
  let playRequest = 0;
  let hasStarted = false;
  let userToggledWhileSticky = false;

  const content = document.querySelector(root.dataset.selector || '.post-content');
  const article = content?.closest('article');
  const candidates = Array.from(article?.querySelectorAll<HTMLElement>(
    'h1, .post-description, .project-description, h2, h3, h4, p, li, blockquote',
  ) ?? []);
  // Match the recorded text rather than relying on browser-specific innerText.
  let nodeCursor = 0;
  const textNodes = sections.map((section) => {
    const found = candidates.findIndex((node, index) => index >= nodeCursor &&
      normalizeNarrationText(node.textContent || '') === section.text);
    if (found < 0) return undefined;
    nodeCursor = found + 1;
    return candidates[found];
  });
  function clearHighlight() {
    textNodes.forEach((node) => node?.classList.remove('audio-speaking-active'));
  }
  function highlight() {
    clearHighlight();
    if (!audio!.paused) textNodes[sectionIndex]?.classList.add('audio-speaking-active');
  }
  function updateProgress() {
    const time = requestedSeek ?? audio!.currentTime;
    sectionIndex = Math.max(0, sections.findLastIndex((section) => section.start <= time + 0.05));
    const duration = Number.isFinite(audio!.duration) ? audio!.duration : narration!.duration;
    const pct = Math.min(100, Math.max(0, duration ? Math.round(time / duration * 100) : 0));
    fill.style.width = `${pct}%`;
    progress.setAttribute('aria-valuenow', String(pct));
    progress.setAttribute('aria-valuetext', t('audio.part', { part: sectionIndex + 1, parts: sections.length }));
    position.textContent = t('audio.part', { part: sectionIndex + 1, parts: sections.length });
    percentage.textContent = `${pct}%`;
    previous.disabled = sectionIndex === 0;
    next.disabled = sectionIndex === sections.length - 1;
    highlight();
  }
  function updateUI() {
    const playing = !audio!.paused && !audio!.ended;
    root!.classList.toggle('is-playing', playing);
    play.querySelector('.icon-play')?.classList.toggle('hidden', playing);
    play.querySelector('.icon-pause')?.classList.toggle('hidden', !playing);
    playText.textContent = playing ? t('audio.pause') : hasStarted ? t('audio.resume') : t('audio.play');
    play.setAttribute('aria-label', playing ? t('audio.pause') : t('audio.playLabel'));
    stop.disabled = !hasStarted;
    if (status && error.hidden) status.textContent = playing ? t('audio.playingNoParts') :
      hasStarted ? t('audio.paused') : t('audio.ready');
  }
  function showError(message: string) {
    error.textContent = message;
    error.hidden = false;
    root!.classList.add('has-audio-error');
    if (status) status.textContent = t('audio.failed');
    clearHighlight();
    updateUI();
  }
  function clearError() {
    error.hidden = true;
    root!.classList.remove('has-audio-error');
  }
  function setExpanded(expanded: boolean) {
    root!.classList.toggle('is-expanded', expanded);
    root!.classList.toggle('is-collapsed', !expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.title = expanded ? root!.dataset.labelCollapse || '' : root!.dataset.labelExpand || '';
    drawer.inert = !expanded;
  }
  function seek(time: number) {
    requestedSeek = time;
    if (audio!.readyState >= HTMLMediaElement.HAVE_METADATA) {
      audio!.currentTime = time;
      requestedSeek = null;
    }
    updateProgress();
  }
  function startPlayback() {
    const request = ++playRequest;
    clearError();
    if (audio!.error) audio!.load();
    root!.classList.add('is-active-player');
    // Call play synchronously inside the tap/click event, including on iOS Safari.
    const result = audio!.play();
    result?.catch((failure: unknown) => {
      if (request !== playRequest || signal.aborted) return;
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      showError(t('audio.failedHint'));
    });
  }

  root.classList.add('is-enhanced');
  play.disabled = false;
  estimate.textContent = t('audio.estimate', { min: Math.max(1, Math.ceil(narration.duration / 60)), parts: sections.length });
  setExpanded(false);
  updateProgress();
  updateUI();

  toggle.addEventListener('click', () => {
    if (root.classList.contains('is-sticky')) userToggledWhileSticky = true;
    setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  }, { signal });
  play.addEventListener('click', () => {
    if (audio.paused || audio.ended) {
      if (audio.ended) seek(0);
      startPlayback();
    } else {
      playRequest++;
      audio.pause();
    }
  }, { signal });
  stop.addEventListener('click', () => {
    playRequest++;
    audio.pause();
    hasStarted = false;
    seek(0);
    clearHighlight();
    clearError();
    root.classList.remove('is-active-player', 'is-sticky');
    userToggledWhileSticky = false;
    updateUI();
  }, { signal });
  previous.addEventListener('click', () => seek(sections[Math.max(0, sectionIndex - 1)].start), { signal });
  next.addEventListener('click', () => seek(sections[Math.min(sections.length - 1, sectionIndex + 1)].start), { signal });
  rate.addEventListener('click', () => {
    rateIndex = (rateIndex + 1) % rates.length;
    audio.playbackRate = rates[rateIndex];
    root.querySelector('#audio-rate-val')!.textContent = `${rates[rateIndex]}x`;
  }, { signal });
  audio.addEventListener('loadedmetadata', () => {
    if (requestedSeek !== null) {
      audio.currentTime = requestedSeek;
      requestedSeek = null;
    }
    updateProgress();
  }, { signal });
  audio.addEventListener('playing', () => {
    hasStarted = true;
    clearError();
    updateUI();
    highlight();
  }, { signal });
  audio.addEventListener('pause', () => { clearHighlight(); updateUI(); }, { signal });
  audio.addEventListener('timeupdate', updateProgress, { signal });
  audio.addEventListener('waiting', () => {
    if (!audio.paused && status) status.textContent = t('audio.loading');
  }, { signal });
  audio.addEventListener('ended', () => {
    hasStarted = false;
    clearHighlight();
    updateUI();
    updateProgress();
  }, { signal });
  audio.addEventListener('error', () => showError(t('audio.failedHint')), { signal });
  window.addEventListener('pagehide', () => audio.pause(), { signal });

  const sentinel = document.createElement('div');
  sentinel.className = 'audio-sticky-sentinel';
  sentinel.style.cssText = 'height:1px;pointer-events:none;visibility:hidden';
  root.before(sentinel);
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
    const wasSticky = root.classList.contains('is-sticky');
    const sticky = root.classList.contains('is-active-player') && !entry.isIntersecting && entry.boundingClientRect.top <= 64;
    root.classList.toggle('is-sticky', sticky);
    if (sticky && !wasSticky && !userToggledWhileSticky) setExpanded(false);
    if (!sticky) userToggledWhileSticky = false;
  }, { rootMargin: '-64px 0px 0px 0px', threshold: 0 }) : null;
  observer?.observe(sentinel);
  disposePlayer = () => {
    playRequest++;
    controller.abort();
    observer?.disconnect();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    clearHighlight();
    sentinel.remove();
    currentRoot = null;
    disposePlayer = undefined;
  };
}

setupAudioPlayer();
document.addEventListener('astro:page-load', setupAudioPlayer);
document.addEventListener('astro:before-swap', () => disposePlayer?.());

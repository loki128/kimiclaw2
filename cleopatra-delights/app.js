/**
 * app.js — Cleopatra Delights · Floating Architecture
 *
 * Sections:
 *  1. Utilities
 *  2. Scroll-reveal (IntersectionObserver)
 *  3. Floating slab interactions (pointer tilt + hover depth)
 *  4. Philosophy proof card float
 *  5. Parallax on scroll (floating slabs)
 *  6. Countdown timer
 *  7. Footer year
 *  8. Init
 */

'use strict';

/* ============================================================
   1. UTILITIES
   ============================================================ */

/**
 * Returns true when the user prefers reduced motion.
 * All animation / motion code checks this before doing anything.
 */
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Clamp a value between a min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Linear interpolation.
 * @param {number} a  – start value
 * @param {number} b  – end value
 * @param {number} t  – factor 0→1
 * @returns {number}
 */
const lerp = (a, b, t) => a + (b - a) * t;


/* ============================================================
   2. SCROLL-REVEAL (IntersectionObserver)
   ============================================================ */

/**
 * Observes all .js-reveal elements and adds the .is-visible class
 * once 15% of the element has scrolled into the viewport.
 *
 * If reduced motion is preferred, all elements are made visible
 * immediately without transition (handled by CSS).
 */
function initReveal() {
  const elements = document.querySelectorAll('.js-reveal');
  if (!elements.length) return;

  /* If reduced motion: skip observer, just show everything. */
  if (prefersReducedMotion()) {
    elements.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          /* Once revealed, no need to keep observing. */
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  elements.forEach(el => observer.observe(el));
}


/* ============================================================
   3. FLOATING SLAB INTERACTIONS
   ============================================================ */

/**
 * Maximum tilt angle (degrees) read from the CSS custom property.
 * Falls back to 6 if the property is not found.
 */
const TILT_MAX = (() => {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--slab-tilt-max')
    .trim();
  return parseFloat(raw) || 6;
})();

/**
 * Lerp speed for the smooth tilt animation.
 * Lower = smoother/lazier; higher = snappier.
 */
const TILT_LERP = 0.1;

/**
 * State tracked per slab card.
 * @typedef {{
 *   el: HTMLElement,
 *   targetX: number,
 *   targetY: number,
 *   currentX: number,
 *   currentY: number,
 *   rafId: number|null,
 *   isHovered: boolean,
 * }} SlabState
 */

/**
 * Initialises the 3-D tilt + hover depth effect on all .js-slab elements.
 *
 * Each slab listens for:
 *   pointermove  → calculates normalised tilt target
 *   pointerleave → resets tilt to flat
 *
 * A requestAnimationFrame loop runs per slab while it is hovered to
 * smoothly lerp the current tilt towards the target tilt.
 */
function initSlabTilt() {
  if (prefersReducedMotion()) return;

  const slabs = document.querySelectorAll('.js-slab');
  if (!slabs.length) return;

  slabs.forEach(el => {
    /** @type {SlabState} */
    const state = {
      el,
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
      rafId: null,
      isHovered: false,
    };

    el.addEventListener('pointerenter', () => {
      state.isHovered = true;
      if (!state.rafId) {
        state.rafId = requestAnimationFrame(() => animateTilt(state));
      }
    });

    el.addEventListener('pointermove', (e) => {
      updateTiltTarget(e, state);
    });

    el.addEventListener('pointerleave', () => {
      state.isHovered = false;
      state.targetX = 0;
      state.targetY = 0;
    });
  });
}

/**
 * Calculate normalised pointer position inside the slab and convert
 * to tilt target values in degrees.
 *
 * @param {PointerEvent} e
 * @param {SlabState} state
 */
function updateTiltTarget(e, state) {
  const rect = state.el.getBoundingClientRect();

  /* Normalise to -1 → +1 within the element */
  const nx = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  const ny = ((e.clientY - rect.top)  / rect.height) * 2 - 1;

  /* Invert Y axis so top of element tilts toward viewer */
  state.targetX = clamp(-ny * TILT_MAX, -TILT_MAX, TILT_MAX);
  state.targetY = clamp( nx * TILT_MAX, -TILT_MAX, TILT_MAX);
}

/**
 * rAF loop: lerps currentX/Y toward targetX/Y and applies the CSS
 * transform.  Continues until both axes settle near zero after hover ends.
 *
 * @param {SlabState} state
 */
function animateTilt(state) {
  state.currentX = lerp(state.currentX, state.targetX, TILT_LERP);
  state.currentY = lerp(state.currentY, state.targetY, TILT_LERP);

  state.el.style.transform =
    `perspective(900px) rotateX(${state.currentX.toFixed(3)}deg) rotateY(${state.currentY.toFixed(3)}deg)`;

  /* Stop loop when close enough to target AND not hovered */
  const settled =
    !state.isHovered &&
    Math.abs(state.currentX) < 0.02 &&
    Math.abs(state.currentY) < 0.02;

  if (settled) {
    state.el.style.transform = '';
    state.rafId = null;
    return;
  }

  state.rafId = requestAnimationFrame(() => animateTilt(state));
}


/* ============================================================
   4. PHILOSOPHY PROOF CARD FLOAT
   ============================================================ */

/**
 * Adds .is-floating to philosophy proof cards after they have been
 * revealed, triggering the gentle perpetual CSS float animation.
 * This is handled by IntersectionObserver so the animation only
 * starts once the cards are visible.
 */
function initProofFloat() {
  if (prefersReducedMotion()) return;

  const cards = document.querySelectorAll('.js-float');
  if (!cards.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-floating');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  cards.forEach(card => observer.observe(card));
}


/* ============================================================
   5. PARALLAX ON SCROLL (Floating Slabs)
   ============================================================ */

/**
 * Applies a subtle vertical parallax offset to floating slab images
 * as the user scrolls, creating a layered depth illusion.
 *
 * Strategy:
 *  - Listen to the 'scroll' event (passive).
 *  - On each scroll event, schedule ONE rAF tick (avoid stacking frames).
 *  - Each slab image moves at a different rate based on its data-index.
 *
 * The parallax shift is intentionally small (2–5%) to remain tasteful.
 */
function initParallax() {
  if (prefersReducedMotion()) return;

  const slabs = document.querySelectorAll('.js-slab');
  if (!slabs.length) return;

  let rafScheduled = false;

  const applyParallax = () => {
    const scrollY = window.scrollY;

    slabs.forEach(slab => {
      const rect = slab.getBoundingClientRect();
      /* Only process slabs that are near the viewport. */
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;

      /* Centre of slab relative to viewport */
      const centreY = rect.top + rect.height / 2;
      const viewportCentre = window.innerHeight / 2;

      /* Normalised offset: -1 (above centre) → +1 (below centre) */
      const offset = (centreY - viewportCentre) / (window.innerHeight * 0.7);

      /* Apply a gentle shift to the inner image only */
      const img = slab.querySelector('.slab__image');
      if (img) {
        const shift = clamp(offset * 28, -28, 28); /* max ±28px */
        img.style.transform = `translateY(${shift.toFixed(2)}px)`;
      }
    });

    rafScheduled = false;
  };

  window.addEventListener('scroll', () => {
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(applyParallax);
    }
  }, { passive: true });

  /* Run once on load so slabs don't pop in */
  applyParallax();
}


/* ============================================================
   6. COUNTDOWN TIMER
   ============================================================ */

/**
 * Drives the Tonight's Drop countdown.
 * Target time: next midnight UTC (so the drop always ends at midnight).
 * Updates every second via setInterval.
 */
function initCountdown() {
  const hoursEl   = document.getElementById('js-hours');
  const minutesEl = document.getElementById('js-minutes');
  const secondsEl = document.getElementById('js-seconds');

  if (!hoursEl || !minutesEl || !secondsEl) return;

  /** Pad a single-digit number to two characters. */
  const pad = (n) => String(n).padStart(2, '0');

  /** Calculate and render the remaining time. */
  const tick = () => {
    const now = new Date();

    /* Next midnight UTC */
    const target = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,  /* tomorrow */
      0, 0, 0
    ));

    const diff = Math.max(0, target - now);

    const totalSeconds = Math.floor(diff / 1000);
    const hours   = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    hoursEl.textContent   = pad(hours);
    minutesEl.textContent = pad(minutes);
    secondsEl.textContent = pad(seconds);
  };

  tick(); /* immediate first render */
  setInterval(tick, 1000);
}


/* ============================================================
   7. FOOTER YEAR
   ============================================================ */

/**
 * Injects the current year into the footer copyright line.
 */
function initFooterYear() {
  const el = document.getElementById('js-year');
  if (el) {
    el.textContent = new Date().getFullYear();
  }
}


/* ============================================================
   8. INIT
   ============================================================ */

/**
 * Entry point.  All feature initialisers run after the DOM is ready.
 */
function init() {
  initReveal();
  initSlabTilt();
  initProofFloat();
  initParallax();
  initCountdown();
  initFooterYear();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  /* DOM already parsed (script at bottom of body) */
  init();
}

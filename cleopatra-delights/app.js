/**
 * Cleopatra Delights — app.js
 * Floating Architecture interaction layer
 *
 * Responsibilities:
 *  1. IntersectionObserver  — reveal .reveal elements as they enter the viewport
 *  2. Slab tilt             — subtle 3-D tilt on mousemove (requestAnimationFrame)
 *  3. Slab parallax         — controlled vertical parallax on scroll (rAF)
 *  4. Countdown timers      — live countdown to each product's drop time
 *  5. Scroll-based hero     — fade out scroll indicator once user scrolls
 *
 * Reduced-motion: all motion functions respect prefers-reduced-motion.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* UTILITIES                                                            */
  /* ------------------------------------------------------------------ */

  /** True when the user prefers reduced motion. */
  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Clamp a number between min and max. */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /** Linear interpolation. */
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /* ------------------------------------------------------------------ */
  /* 1. INTERSECTION OBSERVER — SCROLL REVEAL                            */
  /* ------------------------------------------------------------------ */

  /**
   * Observes every element with class `.reveal`.
   * Adds `.is-visible` when the element enters the viewport.
   * CSS handles the actual fade + rise transition.
   */
  function initReveal() {
    const targets = document.querySelectorAll('.reveal');
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            // Unobserve after reveal — each element reveals once
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,      // trigger when 12% of the element is visible
        rootMargin: '0px 0px -40px 0px', // slight offset from bottom edge
      }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 2. SLAB TILT — SUBTLE 3-D TILT ON MOUSEMOVE (requestAnimationFrame) */
  /* ------------------------------------------------------------------ */

  /**
   * Applies a subtle CSS perspective tilt to each `.slab-card` based on
   * where the pointer is relative to the card's centre.
   *
   * Max tilt angle is intentionally small (4°) to stay architectural.
   * Uses requestAnimationFrame to keep the DOM write outside the event handler.
   */
  function initSlabTilt() {
    if (prefersReducedMotion()) return;

    var MAX_TILT = 4; // degrees
    var LERP_FACTOR = 0.12; // smoothing — lower = smoother/slower

    var cards = document.querySelectorAll('.slab-card');
    if (!cards.length) return;

    cards.forEach(function (card) {
      var currentX = 0;
      var currentY = 0;
      var targetX  = 0;
      var targetY  = 0;
      var rafId    = null;
      var isHovered = false;

      /** Compute target tilt angles from pointer position within card. */
      function onPointerMove(event) {
        var rect   = card.getBoundingClientRect();
        var relX   = (event.clientX - rect.left) / rect.width  - 0.5; // -0.5 to 0.5
        var relY   = (event.clientY - rect.top)  / rect.height - 0.5;

        // Invert Y: pointer at top → tilt card top away (negative rotateX)
        targetX = clamp(-relY * MAX_TILT * 2, -MAX_TILT, MAX_TILT);
        targetY = clamp(relX  * MAX_TILT * 2, -MAX_TILT, MAX_TILT);
      }

      /** Smoothly interpolate current tilt towards target; write once per frame. */
      function animate() {
        if (!isHovered) {
          // Return to flat
          targetX = 0;
          targetY = 0;
        }

        currentX = lerp(currentX, targetX, LERP_FACTOR);
        currentY = lerp(currentY, targetY, LERP_FACTOR);

        // Only write to DOM when meaningfully different from flat
        var isDone = Math.abs(currentX) < 0.01 && Math.abs(currentY) < 0.01 && !isHovered;
        if (isDone) {
          card.style.transform = '';
          rafId = null;
          return;
        }

        card.style.transform =
          'perspective(900px) rotateX(' + currentX + 'deg) rotateY(' + currentY + 'deg)';

        rafId = requestAnimationFrame(animate);
      }

      /** Start animation loop on enter. */
      card.addEventListener('mouseenter', function () {
        isHovered = true;
        if (!rafId) {
          rafId = requestAnimationFrame(animate);
        }
      });

      card.addEventListener('mousemove', onPointerMove);

      /** Begin return-to-flat on leave. */
      card.addEventListener('mouseleave', function () {
        isHovered = false;
        if (!rafId) {
          rafId = requestAnimationFrame(animate);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 3. SLAB PARALLAX — CONTROLLED SCROLL PARALLAX (requestAnimationFrame) */
  /* ------------------------------------------------------------------ */

  /**
   * Applies a gentle vertical parallax offset to each `.slab-card` based on
   * its position relative to the viewport centre.
   *
   * Strength is kept at 0.06 (6%) to avoid motion sickness.
   */
  function initSlabParallax() {
    if (prefersReducedMotion()) return;

    var STRENGTH  = 0.06;
    var cards = document.querySelectorAll('.slab-card');
    if (!cards.length) return;

    var rafId   = null;
    var lastScroll = window.scrollY;

    function update() {
      var scrollY = window.scrollY;
      var vpH     = window.innerHeight;

      cards.forEach(function (card) {
        var rect    = card.getBoundingClientRect();
        var centre  = rect.top + rect.height / 2;
        var offset  = (centre - vpH / 2) * STRENGTH;
        // We compose with the tilt transform already on the card — we use a
        // CSS custom property so the two transforms don't conflict.
        card.style.setProperty('--parallax-y', offset.toFixed(2) + 'px');
      });

      lastScroll = scrollY;
      rafId = null;
    }

    window.addEventListener('scroll', function () {
      if (!rafId) {
        rafId = requestAnimationFrame(update);
      }
    }, { passive: true });

    // Run once on load
    update();
  }

  /* ------------------------------------------------------------------ */
  /* 4. COUNTDOWN TIMER                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Each `.countdown` element carries a `data-target` attribute with an
   * ISO-8601 datetime string.  This function ticks each timer every second.
   *
   * Markup expected inside .countdown:
   *   <span class="countdown__number" data-part="hours">00</span>
   *   <span class="countdown__number" data-part="minutes">00</span>
   *   <span class="countdown__number" data-part="seconds">00</span>
   */
  function initCountdowns() {
    var timers = document.querySelectorAll('.countdown[data-target]');
    if (!timers.length) return;

    /** Format integer as zero-padded two-digit string. */
    function pad(n) {
      return String(Math.max(0, n)).padStart(2, '0');
    }

    /** Update a single timer element. */
    function tick(timer) {
      var target = new Date(timer.dataset.target).getTime();
      var now    = Date.now();
      var diff   = Math.max(0, target - now);

      var totalSecs = Math.floor(diff / 1000);
      var hours   = Math.floor(totalSecs / 3600);
      var minutes = Math.floor((totalSecs % 3600) / 60);
      var seconds = totalSecs % 60;

      var hoursEl   = timer.querySelector('[data-part="hours"]');
      var minutesEl = timer.querySelector('[data-part="minutes"]');
      var secondsEl = timer.querySelector('[data-part="seconds"]');

      if (hoursEl)   hoursEl.textContent   = pad(hours);
      if (minutesEl) minutesEl.textContent = pad(minutes);
      if (secondsEl) secondsEl.textContent = pad(seconds);
    }

    timers.forEach(function (timer) {
      tick(timer); // immediate first render
      setInterval(function () { tick(timer); }, 1000);
    });
  }

  /* ------------------------------------------------------------------ */
  /* 5. HERO SCROLL INDICATOR FADE                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Fades the scroll indicator as the user scrolls away from the top.
   */
  function initHeroScrollIndicator() {
    var indicator = document.querySelector('.hero__scroll');
    if (!indicator) return;

    var rafId = null;

    function update() {
      var progress = clamp(window.scrollY / 200, 0, 1);
      indicator.style.opacity = String((1 - progress) * 0.5);
      rafId = null;
    }

    window.addEventListener('scroll', function () {
      if (!rafId) {
        rafId = requestAnimationFrame(update);
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* BOOTSTRAP                                                             */
  /* ------------------------------------------------------------------ */

  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initSlabTilt();
    initSlabParallax();
    initCountdowns();
    initHeroScrollIndicator();
  });

}());

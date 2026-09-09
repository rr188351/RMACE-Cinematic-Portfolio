/* ==========================================================================
   RMACE — Main interactions (vanilla JS, no dependencies)
   Used by: ramw.html · figma.html · index.html
   - Sticky nav scroll state
   - Mobile menu
   - Active section highlighting (IntersectionObserver)
   - Scroll reveal (IntersectionObserver)
   - Accessible modal system
   - Read-more toggle
   - Projects category tabs
   - Dynamic footer year
   ========================================================================== */

(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Sticky nav ---------- */
  var nav = document.querySelector(".nav");
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile menu ---------- */
  var navToggle = document.querySelector(".nav__toggle");
  var navMenu = document.getElementById("nav-menu");

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", function () {
      var isOpen = navMenu.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    // Close mobile menu when a link inside it is clicked
    navMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && navMenu.classList.contains("is-open")) {
        navMenu.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Active nav section highlight ---------- */
  var sectionLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav__link[href^="#"]')
  );

  if (sectionLinks.length && "IntersectionObserver" in window) {
    // Gather the sections referenced by in-page nav links
    var targets = [];
    sectionLinks.forEach(function (link) {
      var id = link.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (el) targets.push({ link: link, el: el });
    });

    if (targets.length) {
      var navObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            var match = targets.find(function (t) { return t.el === entry.target; });
            if (!match) return;
            if (entry.isIntersecting) {
              sectionLinks.forEach(function (l) { l.classList.remove("is-active"); });
              match.link.classList.add("is-active");
            }
          });
        },
        { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
      );
      targets.forEach(function (t) { navObserver.observe(t.el); });
    }
  }

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length && "IntersectionObserver" in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Modal system ---------- */
  var lastFocused = null;

  function openModal(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    var closeBtn = modal.querySelector(".modal__close");
    if (closeBtn) closeBtn.focus();
    // Re-trigger the entrance animation each time it opens
    var panel = modal.querySelector(".modal__panel");
    if (panel) {
      panel.style.animation = "none";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { panel.style.animation = ""; });
      });
    }
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  // Open buttons
  document.querySelectorAll("[data-open-modal]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      openModal(btn.getAttribute("data-open-modal"));
    });
  });

  // Close buttons + backdrop clicks
  document.querySelectorAll(".modal").forEach(function (modal) {
    modal.querySelectorAll(".modal__close, .modal__backdrop").forEach(function (el) {
      el.addEventListener("click", function () { closeModal(modal); });
    });
  });

  // Escape closes the topmost open modal
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var openModals = document.querySelectorAll(".modal:not([hidden])");
      if (openModals.length) closeModal(openModals[openModals.length - 1]);
    }
  });

  /* ---------- Read more toggle (About) ---------- */
  var aboutToggle = document.querySelector(".js-about-toggle");
  if (aboutToggle) {
    aboutToggle.addEventListener("click", function () {
      var more = document.getElementById("about-more");
      var isOpen = !more.hidden;
      more.hidden = isOpen;
      aboutToggle.textContent = isOpen ? "Read More" : "Show Less";
      aboutToggle.setAttribute("aria-expanded", String(!isOpen));
    });
  }

  /* ---------- Projects tabs ---------- */
  var tabButtons = document.querySelectorAll(".tab-btn");
  if (tabButtons.length) {
    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-target"));
        if (!target) return;

        tabButtons.forEach(function (b) {
          var active = b === btn;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-selected", active ? "true" : "false");
        });

        document.querySelectorAll(".tab-panel").forEach(function (panel) {
          panel.hidden = true;
        });
        target.hidden = false;
      });
    });
  }

  /* ---------- Footer year ---------- */
  var yearEls = document.querySelectorAll(".js-year");
  if (yearEls.length) {
    var year = new Date().getFullYear();
    yearEls.forEach(function (el) { el.textContent = year; });
  }
})();
/* ==========================================================================
   FitPulse phone showreel (figma.html)
   Cycles the four phone screens through dark/light themes, mirroring the
   Fitnplus case-study cover animation (HOME·D → HOME·L → PROGRESS·D → …).
   Runs inside its own closure so a failure in the shared startup code can
   never disable the showreel.
   ========================================================================== */
(function () {
  "use strict";

  var reduced = false;
  try {
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    /* older browsers — fall through and animate anyway */
  }

  Array.prototype.forEach.call(document.querySelectorAll(".fp-phone"), function (phone) {
    if (phone.getAttribute("data-fp-ready") === "1") return;
    phone.setAttribute("data-fp-ready", "1");

    var darkLayer = phone.querySelector(".fp-theme-dark");
    var lightLayer = phone.querySelector(".fp-theme-light");
    var wrap = darkLayer ? darkLayer.querySelector(".fp-screens") : null;
    if (!wrap) return;

    /* Mirror the four app screens into the light layer so the
       dark ⇄ light crossfade swaps colors inside the same layout. */
    var clone = wrap.cloneNode(true);
    if (lightLayer && clone) lightLayer.appendChild(clone);

    var darkScreens = Array.prototype.slice.call(wrap.querySelectorAll(".fp-screen"));
    var lightScreens = clone ? Array.prototype.slice.call(clone.querySelectorAll(".fp-screen")) : [];
    var total = darkScreens.length;
    if (!total) return;

    function setActive(list, i) {
      list.forEach(function (s, k) {
        s.classList.toggle("s-active", k === i);
        s.setAttribute("aria-hidden", k === i ? "false" : "true");
      });
    }

    /* screen = floor(state/2), theme = state%2 (0 dark, 1 light) */
    var state = 0;
    function applyState() {
      var screen = Math.floor(state / 2) % total;
      var lightOn = (state % 2) === 1;
      setActive(darkScreens, screen);
      setActive(lightScreens, screen);
      if (darkLayer) darkLayer.style.opacity = lightOn ? "0" : "1";
      if (lightLayer) lightLayer.style.opacity = lightOn ? "1" : "0";
    }

    setActive(darkScreens, 0);
    setActive(lightScreens, 0);
    if (reduced) return;

    window.setInterval(function () {
      state = (state + 1) % (total * 2);
      applyState();
    }, 5000);
  });
})();
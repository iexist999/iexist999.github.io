/* good chunks of this code were built with the help of an ai.
	actually, most of it was. i suck at webdev you cant blame me
	(well, you can, but please dont >.<)*/

// ---------- Settings ----------
const FADE_MS = 300;             // must match --fade-ms in style.css
const SCROLL_MS = 1400;          // scroll duration

// handwritten titles
const TITLE_DIR = "svg/";        // folder with your title SVGs
const WRITE_SPEED = 600;         // SVG units drawn per second
const MIN_STROKE_MS = 150;       // shortest time any single stroke takes
const STROKE_OVERLAP = 0.6;      // 0.6 = next stroke starts at 60% of the previous one
const DEFAULT_STROKE_WIDTH = 20; // used only if a path has no stroke width
const WIPE_MS = 2200;            // fallback reveal if the SVG loads as an <img>

// letter-by-letter text fade
const TEXT_LETTER_MS = 25;       // delay between letters
const TEXT_MAX_MS = 1500;        // a whole tab's text never takes longer than this to appear
const TEXT_FADE_MS = 250;        // how long each letter takes to fade in
const TEXT_START_MS = 0;         // wait before the first letter

// gamemode boxes
const STAGGER_GAP = 22;          // min vertical space between boxes on the same side

const tabs   = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const tabBar = document.querySelector(".tabs");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let current = null;              // null = no tab open yet
let token = 0;                   // lets rapid clicks cancel older switches
let scrollFrame = null;

// ---------- Slow ease-out scroll ----------
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function scrollToTabs() {
  cancelAnimationFrame(scrollFrame);

  const start = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const target = Math.min(tabBar.getBoundingClientRect().top + start, maxScroll);
  const distance = target - start;
  if (distance <= 0) return;

  if (reduceMotion.matches) {
    window.scrollTo(0, target);
    return;
  }

  const t0 = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / SCROLL_MS, 1);
    window.scrollTo(0, start + distance * easeOutCubic(t));
    if (t < 1) scrollFrame = requestAnimationFrame(step);
  }
  scrollFrame = requestAnimationFrame(step);
}

["wheel", "touchstart", "keydown"].forEach(evt =>
  window.addEventListener(evt, () => cancelAnimationFrame(scrollFrame), { passive: true })
);

// ---------- Handwritten titles ----------
function titleUrl(el) {
  if (el.dataset.svg) return TITLE_DIR + el.dataset.svg;
  return TITLE_DIR + el.dataset.title.toLowerCase().replace(/[^a-z0-9]/g, "") + ".svg";
}

async function loadTitle(el) {
  const url = titleUrl(el);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
    if (doc.querySelector("parsererror")) throw new Error("invalid SVG");

    const svg = document.importNode(doc.documentElement, true);
    if (svg.hasAttribute("viewBox")) {   // let CSS control the size
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    }
    svg.setAttribute("aria-hidden", "true");

    const vb = svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width) el.style.setProperty("--svg-w", vb.width);   // canvas width in SVG units

    el.setAttribute("aria-label", el.dataset.title);
    el.replaceChildren(svg);
    return;
  } catch (err) {
    console.warn("[title] inline SVG failed for", url, "-", err.message);
  }

  // fallback: plain <img>, only swapped in if it actually loads
  await new Promise(resolve => {
    const img = new Image();
    img.alt = el.dataset.title;
    img.onload = () => { el.replaceChildren(img); resolve(); };
    img.onerror = () => { console.error("[title] not found:", url); resolve(); };
    img.src = url;
  });
}

function playTitle(el) {
  el.getAnimations({ subtree: true }).forEach(a => a.cancel());

  const svg = el.querySelector("svg");

  if (!svg) {   // loaded as <img>: simple left-to-right wipe
    const img = el.querySelector("img");
    if (img && !reduceMotion.matches) img.animate(
      [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      { duration: WIPE_MS, easing: "ease-out", fill: "both" }
    );
    return;
  }

  const strokes = [...svg.querySelectorAll("path, line, polyline")]
    .filter(p => !p.closest("defs, clipPath, mask, symbol"));

  let start = 0;
  strokes.forEach(p => {
    const cs = getComputedStyle(p);
    p.style.fill = "none";
    if (cs.stroke === "none") p.style.stroke = "#ffffff";
    if (!parseFloat(cs.strokeWidth)) p.style.strokeWidth = DEFAULT_STROKE_WIDTH;
    p.style.strokeLinecap = "round";
    p.style.strokeLinejoin = "round";

    const len = p.getTotalLength();
    p.style.strokeDasharray = len;

    if (reduceMotion.matches) {      // no motion: just show the finished title
      p.style.strokeDashoffset = 0;
      return;
    }

    p.style.strokeDashoffset = len;  // hidden until its animation starts
    const dur = Math.max(MIN_STROKE_MS, (len / WRITE_SPEED) * 1000);
    p.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: dur, delay: start, easing: "linear", fill: "both" }
    );
    start += dur * STROKE_OVERLAP;
  });
}

// load every title; ones OUTSIDE a tab panel (the header) write themselves right away
document.querySelectorAll(".hand-title").forEach(el => {
  el._ready = loadTitle(el);
  if (!el.closest(".panel")) el._ready.then(() => playTitle(el));
});

// ---------- Letter-by-letter text ----------
function splitText(root) {
  const chars = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach(node => {
    if (!node.nodeValue.trim()) return;
    if (node.parentElement.classList.contains("char")) return;   // already split

    const frag = document.createDocumentFragment();
    node.nodeValue.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.append(part); return; }     // keep spaces as plain text

      const word = document.createElement("span");               // words stay together when wrapping
      word.className = "word";
      for (const ch of part) {
        const c = document.createElement("span");
        c.className = "char";
        c.textContent = ch;
        word.append(c);
        chars.push(c);
      }
      frag.append(word);
    });
    node.replaceWith(frag);
  });
  return chars;
}

// split the text of every panel once, up front
panels.forEach(panel => {
  panel._chars = [];
  panel.querySelectorAll(":is(h1:not(.hand-title), h2, h3, p, li)").forEach(el => {
    panel._chars.push(...splitText(el));
  });
});

function playText(panel) {
  const chars = panel._chars;
  chars.forEach(c => c.getAnimations().forEach(a => a.cancel()));

  if (reduceMotion.matches) {        // no motion
    chars.forEach(c => { c.style.opacity = 1; });
    return;
  }

  const step = Math.min(TEXT_LETTER_MS, TEXT_MAX_MS / Math.max(chars.length, 1));

  chars.forEach((c, i) => {
    c.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: TEXT_FADE_MS, delay: TEXT_START_MS + i * step, easing: "ease-out", fill: "both" }
    );
  });
}

// ---------- Tab switching ----------
function switchTo(name) {
  if (name === current) return;

  const isFirstOpen = current === null;
  if (isFirstOpen) document.documentElement.classList.remove("locked");
  current = name;
  const myToken = ++token;

  const wasAtTop = window.scrollY === 0;

  tabs.forEach(tab => {
    const isActive = tab.dataset.tab === name;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive);
  });

  panels.forEach(panel => panel.classList.remove("visible"));

  setTimeout(() => {
    if (myToken !== token) return;

    panels.forEach(panel => { panel.hidden = panel.id !== name; });

    const incoming = document.getElementById(name);
    void incoming.offsetWidth;       // force reflow so the fade-in transition runs
    incoming.classList.add("visible");

    // write the titles inside this panel
    incoming.querySelectorAll(".hand-title").forEach(el => {
      el._ready.then(() => { if (myToken === token) playTitle(el); });
    });

    playText(incoming);

    if (wasAtTop) scrollToTabs();
  }, isFirstOpen ? 0 : FADE_MS);
}

tabs.forEach(tab => {
  tab.addEventListener("click", () => switchTo(tab.dataset.tab));
});

// ---------- Lock the page until the first tab is opened (if the tabs fit on screen) ----------
function unlockIfTabsOffscreen() {
  if (current !== null) return;      // a tab is already open, nothing to do
  const tabsBottom = tabBar.getBoundingClientRect().bottom + window.scrollY;
  const fits = tabsBottom <= window.innerHeight;
  document.documentElement.classList.toggle("locked", fits);
}

window.addEventListener("resize", unlockIfTabsOffscreen);
new ResizeObserver(unlockIfTabsOffscreen).observe(document.querySelector(".hero"));
unlockIfTabsOffscreen();

// ---------- Scribble boxes ----------
// background: 9 layers (fill, 4 corners, 4 edges) inside every gamemode and devlog box
function addScribbleBox(el) {
  const box = document.createElement("div");
  box.className = "box";
  box.setAttribute("aria-hidden", "true");
  ["fill", "c tl", "c tr", "c bl", "c br", "e t", "e b", "e l", "e r"].forEach(cls => {
    const piece = document.createElement("i");
    piece.className = cls;
    box.append(piece);
  });
  el.prepend(box);
}

document.querySelectorAll(".mode-list li, .info-box").forEach(addScribbleBox);

// ---------- Gamemode layout ----------
const modeList = document.querySelector(".mode-list");

// stagger: left, right, left... each box starts at the vertical middle of the previous one
function layoutModeBoxes() {
  const items = [...modeList.children];
  const stagger = window.matchMedia("(min-width: 601px)").matches;

  modeList.classList.toggle("staggered", stagger);
  items.forEach(li => { li.style.top = ""; });
  modeList.style.height = "";
  if (!stagger) return;              // phones: normal stacked list

  const tops = [], heights = [], bottoms = [];
  items.forEach((li, i) => {
    const h = li.offsetHeight;
    let top = 0;
    if (i > 0) top = tops[i - 1] + heights[i - 1] / 2;                // middle of the previous box
    if (i > 1) top = Math.max(top, bottoms[i - 2] + STAGGER_GAP);     // never overlap the box on the same side
    tops.push(top);
    heights.push(h);
    bottoms.push(top + h);
    li.style.top = top + "px";
  });
  modeList.style.height = Math.max(...bottoms) + "px";
}

if (modeList) {
  // re-runs when the panel becomes visible, the window resizes, or text reflows
  const ro = new ResizeObserver(layoutModeBoxes);
  ro.observe(modeList);
  modeList.querySelectorAll("li").forEach(li => ro.observe(li));
  if (document.fonts) document.fonts.ready.then(layoutModeBoxes);
  layoutModeBoxes();
}

// ---------- Wavy box titles (while the box is hovered) ----------
const WAVE_HEIGHT = 5;         // how far letters move up and down, in px
const WAVE_PERIOD_MS = 1300;   // time for one full wave
const WAVE_LAG_MS = 140;       // each letter is this far behind the previous one
const WAVE_EASE_MS = 500;      // time to ease into / out of the wave

if (window.matchMedia("(hover: hover)").matches && !reduceMotion.matches) {
  document.querySelectorAll(".info-box").forEach(box => {
    const letters = [...box.querySelectorAll("h3 .char")];
    let strength = 0;            // 0 = flat, 1 = full wave
    let target = 0;              // where strength is heading
    let last = 0;
    let frame = null;

    function tick(now) {
      const dt = now - last;
      last = now;

      // move strength toward the target at a steady speed
      const stepSize = dt / WAVE_EASE_MS;
      strength = target > strength
        ? Math.min(strength + stepSize, target)
        : Math.max(strength - stepSize, target);

      const eased = strength * strength * (3 - 2 * strength);   // smooth start and end

      letters.forEach((c, i) => {
        const phase = ((now + i * WAVE_LAG_MS) / WAVE_PERIOD_MS) * Math.PI * 2;
        c.style.transform = `translateY(${Math.sin(phase) * eased * WAVE_HEIGHT}px)`;
      });

      if (strength === 0 && target === 0) {   // fully back to rest: stop the loop
        letters.forEach(c => { c.style.transform = ""; });
        frame = null;
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    function setTarget(value) {
      target = value;
      if (frame === null) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

    box.addEventListener("mouseenter", () => setTarget(1));
    box.addEventListener("mouseleave", () => setTarget(0));
  });
}
// === Config ===
const PRIOR_MEAN = 4.0;
const PRIOR_WEIGHT = 50;
const DEBUG = false;

const log = (...args) => { if (DEBUG) console.debug('[ARENH]', ...args); };

// Build marker (temporary, for diagnosing loads). If you don't see this in the
// console, Chrome is running a stale copy of content.js.
console.log('[ARENH] loaded build: sort-toggle-1 (button toggles adj-rating sort)');

// ---------- Helpers ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fmt = (n, d=2) => (Math.round(n * 10**d) / 10**d).toFixed(d);

function parseRatingText(t) {
  if (!t) return null;
  const m = t.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function parseCountText(t) {
  if (!t) return null;
  const s = t.replace(/\u00A0/g, ' ').trim();
  // Prefer parentheses like "(37)"
  const paren = s.match(/\(\s*([\d\.,kKmM]+)\s*\)/);
  if (paren) {
    const val = paren[1].toLowerCase();
    if (val.includes('k')) return Math.round(parseFloat(val)*1e3);
    if (val.includes('m')) return Math.round(parseFloat(val)*1e6);
    return parseInt(val.replace(/[^\d]/g,''), 10);
  }
  // K/M suffix
  const km = s.match(/([\d\.,]+)\s*([kKmM])/);
  if (km) {
    const base = parseFloat(km[1].replace(',', '.'));
    if (isNaN(base)) return null;
    return Math.round(base * (km[2].toLowerCase() === 'k' ? 1e3 : 1e6));
  }
  // digits only
  const digits = s.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}
function parseCountFromAria(el) {
  if (!el) return null;
  return parseCountText(el.getAttribute('aria-label') || '');
}
function bayesAdjusted(xbar, n, mu=PRIOR_MEAN, m=PRIOR_WEIGHT) {
  if (xbar == null || n == null) return null;
  return (xbar * n + mu * m) / (n + m);
}

// Quantiles
function quantile(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x,y)=>x-y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi]-a[lo]) * (idx - lo);
}

// Colors by page-relative bands
function colorByBands(adj, n, bands) {
  const conf = n / (n + PRIOR_WEIGHT);
  const sat = 70 * (0.5 + 0.5 * conf);
  const light = 92 - 20 * conf;
  if (bands && bands.t1 != null && bands.t2 != null) {
    if (adj < bands.t1) return `hsl(10 ${sat}% ${light}%)`;
    if (adj < bands.t2) return `hsl(40 ${sat}% ${light}%)`;
    return `hsl(115 ${sat}% ${light}%)`;
  }
  const hue = Math.max(0, Math.min(120, ((adj - 1) / 4) * 120));
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function makeBadge(adj, xbar, n, mu, m) {
  const badge = document.createElement('div');
  badge.className = 'arenh-badge';
  badge.innerHTML = `
    <div class="arenh-row">
      <span class="arenh-key">Adj</span>
      <span class="arenh-star">${fmt(adj, 2)}★</span>
      <span class="arenh-key">n=${n}</span>
    </div>`;
  badge.title = `Adjusted = (x̄·n + μ·m) / (n + m)\n` +
                `x̄=${xbar}  n=${n}  μ=${mu}  m=${m}`;
  return badge;
}

// ---------- ASIN helpers & color persistence ----------
function extractASINFromUrl(url) {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/[^/]*\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}
function getASINFromDocument() {
  const fromUrl = extractASINFromUrl(location.pathname);
  if (fromUrl) return fromUrl;
  const ac = document.querySelector('#averageCustomerReviews_feature_div');
  const csa = ac?.getAttribute('data-csa-c-asin');
  if (csa && csa.length === 10) return csa.toUpperCase();
  const any = document.querySelector('[data-asin]')?.getAttribute('data-asin');
  if (any && any.length === 10) return any.toUpperCase();
  const og = document.querySelector('meta[property="og:url"]')?.content;
  const fromOg = og && extractASINFromUrl(og);
  if (fromOg) return fromOg;
  return null;
}
function getASINFromCard(card) {
  const attr = card.getAttribute('data-asin');
  if (attr && attr.length === 10) return attr.toUpperCase();
  const href = card.querySelector('a.a-link-normal[href*="/dp/"]')?.href || '';
  return extractASINFromUrl(href);
}

// simple localStorage map with pruning
const STORE_KEY = 'arenhColors';
function setColorForAsin(asin, color) {
  try {
    const now = Date.now();
    const store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    store[asin] = { color, ts: now };
    // prune oldest if > 200
    const keys = Object.keys(store);
    if (keys.length > 220) {
      keys.sort((a,b)=>store[a].ts - store[b].ts).slice(0, keys.length-200).forEach(k=>delete store[k]);
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}
function getColorForAsin(asin) {
  try {
    const store = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const rec = store[asin];
    if (!rec) return null;
    if (Date.now() - (rec.ts||0) > 1000*60*60*48) return null; // 48h expiry
    return rec.color || null;
  } catch { return null; }
}

// ---------- PDP (product page) ----------
function getPdpData() {
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      let data;
      try { data = JSON.parse(s.textContent.trim()); } catch { continue; }
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (node && (node['@type'] === 'Product' || node['@type']?.includes?.('Product')) && node.aggregateRating) {
          const xbar = parseFloat(node.aggregateRating.ratingValue);
          const n = parseInt(node.aggregateRating.reviewCount);
          if (!isNaN(xbar) && !isNaN(n)) return { xbar, n };
        }
      }
    }
  } catch {}
  const ratingEl =
    document.querySelector('#acrPopover .a-icon-alt') ||
    document.querySelector('#averageCustomerReviews .a-icon-alt') ||
    document.querySelector('[data-hook="acr-average-stars-rating-text"]');
  const countEl =
    document.querySelector('#acrCustomerReviewText') ||
    document.querySelector('[data-hook="total-review-count"]') ||
    document.querySelector('#acrCustomerReviewLink #acrCustomerReviewText');
  const xbar = parseRatingText(ratingEl?.textContent || '');
  const n = parseCountText(countEl?.textContent || '');
  if (xbar && n) return { xbar, n };
  return null;
}

function enhancePDP() {
  const data = getPdpData();
  if (!data) return;

  const adj = bayesAdjusted(data.xbar, data.n);
  if (!adj) return;

  // Ensure a single PDP badge. If a correct one already exists, leave it — remove+re-insert
  // on every observer pass would churn childList and spin the observer indefinitely.
  const center = document.getElementById('centerCol') || document;
  const existing = center.querySelectorAll('.arenh-badge[data-arenh-loc="pdp"]');
  const desiredStar = `${fmt(adj, 2)}★`;
  if (existing.length === 1) {
    const s = existing[0].querySelector('.arenh-star');
    if (s && s.textContent === desiredStar) return;
  }
  existing.forEach(el => el.remove());

  const badge = makeBadge(adj, data.xbar, data.n, PRIOR_MEAN, PRIOR_WEIGHT);
  badge.setAttribute('data-arenh-loc', 'pdp');

  // Apply persisted color from SERP if available
  const asin = getASINFromDocument();
  const persisted = asin && getColorForAsin(asin);
  if (persisted) badge.style.background = persisted;

  // Insert after rating block, before Amazon's Choice if present
  const ratingBlock = document.querySelector('#averageCustomerReviews_feature_div');
  const ac = document.querySelector('#acBadge_feature_div');
  if (ac && ac.parentElement) {
    ac.parentElement.insertBefore(badge, ac);
  } else if (ratingBlock) {
    ratingBlock.insertAdjacentElement('afterend', badge);
  }
}

// ---------- SERP (search results) ----------
function getSerpCount(row, card) {
  // Prefer the blue reviews link with parentheses
  let a = row.querySelector('a.a-link-normal.s-underline-text.s-underline-link-text.s-link-style[href*="customerReviews"], a.a-link-normal[href*="customerReviews"], a.a-link-normal[href*="product-reviews"]');
  if (a) {
    const n = parseCountText(a.textContent) || parseCountFromAria(a);
    if (n) return n;
  }
  // Fallback span with "(NN)"
  const span = row.querySelector('span.s-underline-text');
  if (span && /\(\s*[\d\.,kKmM]+\s*\)/.test(span.textContent)) {
    const n = parseCountText(span.textContent);
    if (n) return n;
  }
  // Fallback: elsewhere in card
  a = card.querySelector('a[href*="customerReviews"], a[href*="product-reviews"]');
  return parseCountText(a?.textContent || '') || parseCountFromAria(a);
}

// Shared SERP card parse: returns { xbar, n, adj, row } or null. Used by both the
// badge enhancer and the sort toggle so they agree on the same ratings.
function getCardRating(card) {
  const starText = card.querySelector('.a-row .a-icon-alt');
  if (!starText || starText.closest('.a-popover, .a-popover-content')) return null;
  const row = starText.closest('.a-row') || starText.parentElement;
  if (!row) return null;
  const xbar = parseRatingText(starText.textContent || '');
  const n = getSerpCount(row, card);
  if (!xbar || !n) return null;
  const adj = bayesAdjusted(xbar, n);
  if (!adj) return null;
  return { xbar, n, adj, row };
}

function enhanceSearch() {
  const cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"]'));
  const infos = [];

  for (const card of cards) {
    const rating = getCardRating(card);
    if (!rating) continue;
    const { xbar, n, adj, row } = rating;

    infos.push({ card, row, adj, xbar, n });

    let badge = row.nextElementSibling && row.nextElementSibling.classList?.contains('arenh-badge')
      ? row.nextElementSibling
      : card.querySelector('.arenh-badge');

    if (!badge) {
      badge = makeBadge(adj, xbar, n, PRIOR_MEAN, PRIOR_WEIGHT);
      row.insertAdjacentElement('afterend', badge);
    } else {
      // Only write when the value actually changed — an unconditional textContent write
      // is a childList mutation that would respin the observer every frame.
      const star = badge.querySelector('.arenh-star');
      const starLabel = `${fmt(adj,2)}★`;
      if (star && star.textContent !== starLabel) star.textContent = starLabel;
      const nEl = badge.querySelector('.arenh-key:last-child');
      const nLabel = `n=${n}`;
      if (nEl && nEl.textContent !== nLabel) nEl.textContent = nLabel;
    }
  }

  if (infos.length) {
    const vals = infos.map(i => i.adj);
    const t1 = quantile(vals, 0.30);
    const t2 = quantile(vals, 0.80);

    for (const info of infos) {
      const badge = info.card.querySelector('.arenh-badge') || info.row.nextElementSibling;
      if (badge) {
        const color = colorByBands(info.adj, info.n, {t1, t2});
        badge.style.background = color;

        // Persist this color by ASIN so PDP can inherit it
        const asin = getASINFromCard(info.card);
        if (asin) setColorForAsin(asin, color);
      }
    }
  }
}

// ---------- Inspector / debug report (on-demand only) ----------
// Trigger: press Alt+Shift+R on any Amazon page, or run __arenhInspect() in the console.
// Output: structured JSON copied to clipboard + logged; also stored at window.__arenhLastReport.
// This is read-only. It never moves or modifies page elements (aside from a transient toast).

function arenhSig(node) {
  const cls = ((node.getAttribute && node.getAttribute('class')) || '')
    .trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.');
  return node.tagName.toLowerCase() + (cls ? '.' + cls : '');
}

// Compact tree of `el` up to `depth`, collapsing runs of same-signature siblings.
function arenhSkeleton(el, depth = 2) {
  function walk(node, d) {
    const self = arenhSig(node);
    if (d <= 0 || !node.children || !node.children.length) return self;
    const kids = [];
    const arr = Array.from(node.children);
    let i = 0;
    while (i < arr.length) {
      let j = i;
      const s = arenhSig(arr[i]);
      while (j + 1 < arr.length && arenhSig(arr[j + 1]) === s) j++;
      const repr = walk(arr[i], d - 1);
      const count = j - i + 1;
      kids.push(count > 1 ? { node: repr, repeat: count } : repr);
      i = j + 1;
    }
    return { node: self, children: kids };
  }
  return walk(el, depth);
}

// Ancestor chain container -> ... -> card (which node would we actually move to reorder?)
function arenhChain(fromEl, toAncestor) {
  const chain = [];
  let cur = fromEl;
  while (cur && cur !== toAncestor && chain.length < 12) {
    chain.push(arenhSig(cur));
    cur = cur.parentElement;
  }
  return chain.reverse();
}

function arenhGuessPageType() {
  const p = location.pathname;
  if (p === '/s' || /[?&]k=/.test(location.search) || document.querySelector('.s-main-slot')) return 'serp';
  if (p.includes('/bestsellers') || p.includes('/zgbs') || p.includes('/gp/bestsellers')) return 'bestsellers';
  if (p.startsWith('/deals') || p.includes('/gp/goldbox') || p.includes('/gp/deals')) return 'deals';
  if (extractASINFromUrl(p) || document.getElementById('centerCol')) return 'pdp';
  return 'other';
}

function arenhToast(msg) {
  let t = document.getElementById('arenh-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'arenh-toast';
    t.style.cssText =
      'position:fixed;z-index:2147483647;bottom:20px;right:20px;background:#111;color:#fff;' +
      'padding:10px 14px;border-radius:8px;font:13px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.35);max-width:340px;transition:opacity .3s;';
    (document.body || document.documentElement).appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 4000);
}

// Robust copy: try async Clipboard API, fall back to a hidden textarea + execCommand
// (execCommand works reliably from a real user gesture inside a content script).
function arenhCopy(text) {
  return new Promise((resolve, reject) => {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        (document.body || document.documentElement).appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        ok ? resolve() : reject(new Error('execCommand copy returned false'));
      } catch (e) { reject(e); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(resolve, fallback);
    } else {
      fallback();
    }
  });
}

// Small always-available button (bottom-left). Click toggles adjusted-rating sort;
// a click can't be swallowed by Amazon's keyboard shortcuts. Alt+Shift+K = inspector.
function arenhMountButton() {
  if (document.getElementById('arenh-inspect-btn')) { arenhUpdateButton(); return; }
  const btn = document.createElement('button');
  btn.id = 'arenh-inspect-btn';
  btn.type = 'button';
  btn.title = 'Toggle: sort results by adjusted rating. (Alt+Shift+K = inspector report)';
  btn.style.cssText =
    'position:fixed;z-index:2147483647;bottom:16px;left:16px;background:#555;color:#fff;' +
    'border:0;padding:7px 11px;border-radius:8px;font:12px/1 system-ui,sans-serif;cursor:pointer;' +
    'opacity:.55;box-shadow:0 2px 8px rgba(0,0,0,.3);transition:opacity .15s,background .15s;';
  btn._restOpacity = '.55';
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = btn._restOpacity || '.55'; });
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleAdjSort(); });
  (document.body || document.documentElement).appendChild(btn);
  arenhUpdateButton();
}

// Reflect ON/OFF state on the button. Guarded so repeated calls (every observer tick)
// don't rewrite textContent — a text-node change is a childList mutation and would
// needlessly retrigger the observer.
function arenhUpdateButton() {
  const btn = document.getElementById('arenh-inspect-btn');
  if (!btn) return;
  // Only rewrite label/background when the state actually flips (dataset read-back is exact,
  // unlike style.background which serializes to rgb()). Keeps textContent writes off the
  // steady-state path so they never respin the observer.
  const state = arenhSortOn ? '1' : '0';
  if (btn.dataset.arenhState !== state) {
    btn.textContent = arenhSortOn ? '⇅ Adj sort: ON' : '⇅ Adj sort: OFF';
    btn.style.background = arenhSortOn ? '#0a7' : '#555';
    btn.dataset.arenhState = state;
  }
  btn._restOpacity = arenhSortOn ? '1' : '.55';
  btn.style.opacity = btn.matches(':hover') ? '1' : btn._restOpacity;
}

function buildInspectorReport() {
  const report = {
    inspectorVersion: '0.1.6-inspect-1',
    ts: new Date().toISOString(),
    url: location.href,
    host: location.hostname,
    path: location.pathname,
    pageType: arenhGuessPageType(),
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };

  // Results container (SERP). Report structure + how cards nest inside it.
  const container =
    document.querySelector('.s-main-slot.s-result-list') ||
    document.querySelector('.s-main-slot');

  if (container) {
    const cs = getComputedStyle(container);
    report.container = {
      matchedSelector: container.classList.contains('s-result-list') ? '.s-main-slot.s-result-list' : '.s-main-slot',
      tag: container.tagName.toLowerCase(),
      classes: container.className,
      directChildCount: container.childElementCount,
      display: cs.display,
      flexDirection: cs.flexDirection,
      gridTemplateColumns: cs.gridTemplateColumns,
      skeleton: arenhSkeleton(container, 2),
    };
  } else {
    report.container = null;
  }

  // Per-card parse using the SAME logic the enhancer uses.
  const cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"]'));
  let ok = 0, failed = 0, sponsored = 0;
  const cardReports = cards.map((card) => {
    const starText = card.querySelector('.a-row .a-icon-alt');
    const inPopover = !!(starText && starText.closest('.a-popover, .a-popover-content'));
    const row = (starText && !inPopover) ? (starText.closest('.a-row') || starText.parentElement) : null;

    const xbar = (starText && !inPopover) ? parseRatingText(starText.textContent || '') : null;
    const n = row ? getSerpCount(row, card) : null;
    const adj = bayesAdjusted(xbar, n);
    const parseOk = !!(xbar && n && adj != null);

    const isSponsored =
      !!card.querySelector('.s-sponsored-label-text, .puis-sponsored-label-text, [data-component-type="sp-sponsored-result"]') ||
      /\bsponsored\b/i.test((card.textContent || '').slice(0, 300));

    if (parseOk) ok++; else failed++;
    if (isSponsored) sponsored++;

    return {
      asin: card.getAttribute('data-asin') || null,
      domIndex: card.getAttribute('data-index') || null,
      directChildOfContainer: container ? (card.parentElement === container) : null,
      chainToContainer: (container && container.contains(card)) ? arenhChain(card, container) : null,
      xbar,
      n,
      adj: adj != null ? Number(fmt(adj, 3)) : null,
      sponsored: isSponsored,
      parseOk,
      failReason: parseOk ? null
        : inPopover ? 'stars-in-popover'
        : !starText ? 'no-stars-el'
        : !xbar ? 'rating-parse-fail'
        : !n ? 'count-parse-fail'
        : 'no-adj',
    };
  });

  report.summary = { totalCards: cards.length, parsedOk: ok, parseFailed: failed, sponsored };
  report.cards = cardReports;

  // Non-product interstitials among the container's direct children (banners, "Related searches", etc.)
  if (container) {
    report.nonCardChildren = Array.from(container.children)
      .filter((ch) => !ch.matches('[data-component-type="s-search-result"]') &&
                      !ch.querySelector('[data-component-type="s-search-result"]'))
      .slice(0, 25)
      .map((ch) => ({
        sig: arenhSig(ch),
        text: (ch.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70),
      }));
  }

  // One full card's markup as ground truth (truncated).
  const sample = cards.find((c) => c.getAttribute('data-asin')) || cards[0];
  if (sample) {
    const html = sample.outerHTML;
    report.sampleCardOuterHTML = html.length > 6000 ? html.slice(0, 6000) + '…[truncated]' : html;
  }

  return report;
}

function runInspector() {
  let report;
  try {
    report = buildInspectorReport();
  } catch (e) {
    console.error('[ARENH] inspector error', e);
    arenhToast('Inspector error — see console');
    return;
  }
  const json = JSON.stringify(report, null, 2);
  window.__arenhLastReport = report;
  window.__arenhLastReportJSON = json;
  console.log('%c[ARENH] Inspector report', 'font-weight:bold;color:#0a7', report);
  const s = report.summary || {};
  arenhCopy(json).then(
    () => arenhToast(`ARENH report copied ✓ • ${s.totalCards ?? 0} cards, ${s.parsedOk ?? 0} parsed, ${s.parseFailed ?? 0} failed`),
    () => arenhToast('Copy failed — report is logged in DevTools console (right-click the object → Copy)')
  );
  return report;
}

// ---------- Sort-by-adjusted-rating toggle (grid SERP) ----------
let arenhSortOn = false;
let arenhAppliedOnce = false;  // have we ever applied sort in this document? (bounds the OFF sweep)
const ARENH_SORT_KEY = 'arenhSortOn';

// Grid search-results container, or null if this isn't a grid SERP.
function arenhGetGridContainer() {
  const container =
    document.querySelector('.s-main-slot.s-result-list') ||
    document.querySelector('.s-main-slot');
  if (!container) return null;
  if (getComputedStyle(container).display !== 'grid') return null;
  return container;
}

// Reorder the grid's product cards by adjusted rating using inline CSS `order`
// (reversible, no DOM moves). Returns { rated, unrated, dupes } or null.
function applyAdjSort() {
  const container = arenhGetGridContainer();
  if (!container) return null;
  arenhAppliedOnce = true;

  const cards = [];   // { el, index, asin, adj }
  const others = [];  // { el, index }  non-product rows (headers, ads, pagination, scripts…)
  Array.from(container.children).forEach((el, index) => {
    if (el.matches('[data-component-type="s-search-result"]')) {
      const asin = getASINFromCard(el);
      const rating = getCardRating(el);
      cards.push({ el, index, asin, adj: rating ? rating.adj : null });
    } else {
      others.push({ el, index });
    }
  });

  // Dedupe by ASIN. Prefer keeping a RATED occurrence so a sponsored copy that failed to
  // parse doesn't hide the organic copy that has a rating. Otherwise keep the first seen.
  // Null/empty ASIN is never deduped.
  const keeperFor = new Map();  // asin -> chosen card
  for (const c of cards) {
    if (!c.asin) continue;
    const cur = keeperFor.get(c.asin);
    if (!cur) keeperFor.set(c.asin, c);
    else if (cur.adj == null && c.adj != null) keeperFor.set(c.asin, c);  // upgrade unrated keeper
  }
  const kept = [];
  const dupes = [];
  for (const c of cards) {
    if (!c.asin) { kept.push(c); continue; }
    (keeperFor.get(c.asin) === c ? kept : dupes).push(c);
  }

  // A keeper can change across re-applies (Amazon re-renders). Un-hide any kept card we hid
  // on a prior pass, else it would stay display:none forever.
  for (const c of kept) {
    if (c.el.getAttribute('data-arenh-hid') === '1') {
      const prev = c.el.getAttribute('data-arenh-prev-display') || '';
      if (prev) c.el.style.display = prev; else c.el.style.removeProperty('display');
      c.el.removeAttribute('data-arenh-hid');
      c.el.removeAttribute('data-arenh-prev-display');
    }
  }

  // Rated: descending by adj, explicit tie-break on original index. Unrated: original order, after.
  const rated = kept.filter((c) => c.adj != null).sort((a, b) => (b.adj - a.adj) || (a.index - b.index));
  const unrated = kept.filter((c) => c.adj == null).sort((a, b) => a.index - b.index);

  const setOrder = (el, val) => {
    const v = String(val);
    if (el.style.order !== v) el.style.order = v;                 // attribute write (not observed)
    if (el.getAttribute('data-arenh-order') !== '1') el.setAttribute('data-arenh-order', '1');
  };

  let pos = 0;
  for (const c of rated) setOrder(c.el, pos++);
  for (const c of unrated) setOrder(c.el, pos++);
  // Non-product rows and hidden dupes sink below, keeping their original relative order.
  const BASE = 100000;
  for (const o of others) setOrder(o.el, BASE + o.index);
  for (const c of dupes) setOrder(c.el, BASE + c.index);

  // Hide duplicate cards (remember prior inline display for exact restore).
  for (const c of dupes) {
    if (c.el.getAttribute('data-arenh-hid') !== '1') {
      c.el.setAttribute('data-arenh-prev-display', c.el.style.display || '');
      c.el.style.display = 'none';
      c.el.setAttribute('data-arenh-hid', '1');
    }
  }

  return { rated: rated.length, unrated: unrated.length, dupes: dupes.length };
}

// Remove every inline order/display we set — restores Amazon's original order exactly.
// Queried document-wide in case Amazon swapped the container since we applied.
function clearAdjSort() {
  document.querySelectorAll('[data-arenh-order]').forEach((el) => {
    el.style.removeProperty('order');
    el.removeAttribute('data-arenh-order');
  });
  document.querySelectorAll('[data-arenh-hid]').forEach((el) => {
    const prev = el.getAttribute('data-arenh-prev-display') || '';
    if (prev) el.style.display = prev; else el.style.removeProperty('display');
    el.removeAttribute('data-arenh-hid');
    el.removeAttribute('data-arenh-prev-display');
  });
}

function setAdjSort(on, opts) {
  const toast = !opts || opts.toast !== false;
  if (on) {
    const stats = applyAdjSort();
    if (!stats) {
      arenhSortOn = false;
      try { sessionStorage.removeItem(ARENH_SORT_KEY); } catch {}
      if (toast) arenhToast('Adj sort: no grid search results on this page');
      arenhUpdateButton();
      return;
    }
    arenhSortOn = true;
    try { sessionStorage.setItem(ARENH_SORT_KEY, '1'); } catch {}
    if (toast) {
      arenhToast(
        `Sorted ${stats.rated} products by adjusted rating` +
        (stats.unrated ? ` • ${stats.unrated} unrated at bottom` : '') +
        (stats.dupes ? ` • ${stats.dupes} duplicates hidden` : '')
      );
    }
  } else {
    clearAdjSort();
    arenhSortOn = false;
    try { sessionStorage.removeItem(ARENH_SORT_KEY); } catch {}
    if (toast) arenhToast('Original Amazon order restored');
  }
  arenhUpdateButton();
}

function toggleAdjSort() { setAdjSort(!arenhSortOn); }

// ---------- Observer/boot ----------
let ticking = false;
const obs = new MutationObserver(() => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    try { enhancePDP(); } catch {}
    try { enhanceSearch(); } catch {}
    if (arenhSortOn) {
      try { applyAdjSort(); } catch {}  // re-fold streamed/lazy-loaded results
    } else if (arenhAppliedOnce && document.querySelector('[data-arenh-order]')) {
      try { clearAdjSort(); } catch {}  // self-heal stray order/hide markers if Amazon reattached nodes
    }
    try { arenhMountButton(); } catch (e) { console.error('[ARENH] mountButton failed', e); }
    ticking = false;
  });
});

(function init() {
  try { enhancePDP(); } catch {}
  try { enhanceSearch(); } catch {}
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // The floating button (bottom-left) toggles adjusted-rating sort.
  // The inspector stays available on Alt+Shift+K (K avoids Amazon's letter shortcuts);
  // stopImmediatePropagation keeps the keypress from reaching Amazon's handlers.
  window.__arenhInspect = runInspector;
  try { arenhMountButton(); } catch {}
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'K' || e.key === 'k' || e.code === 'KeyK')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      runInspector();
    }
  }, true);

  // Restore this tab's sort preference silently (no toast on every page load). Set the
  // flag first so the observer re-applies once results finish streaming in, even if the
  // grid isn't ready yet at document_idle. Never clears the pref on a transient miss.
  try {
    if (sessionStorage.getItem(ARENH_SORT_KEY) === '1') {
      arenhSortOn = true;
      try { applyAdjSort(); } catch {}
      arenhUpdateButton();
    }
  } catch {}
})();

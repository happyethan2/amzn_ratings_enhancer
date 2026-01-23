// === Config ===
const PRIOR_MEAN = 4.0;
const PRIOR_WEIGHT = 50;
const DEBUG = false;

const log = (...args) => { if (DEBUG) console.debug('[ARENH]', ...args); };

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

  // Ensure single PDP badge
  const center = document.getElementById('centerCol') || document;
  center.querySelectorAll('.arenh-badge[data-arenh-loc="pdp"]').forEach(el => el.remove());

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

function enhanceSearch() {
  const cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"]'));
  const infos = [];

  for (const card of cards) {
    const starText = card.querySelector('.a-row .a-icon-alt');
    if (!starText || starText.closest('.a-popover, .a-popover-content')) continue;
    const row = starText.closest('.a-row') || starText.parentElement;
    if (!row) continue;

    const xbar = parseRatingText(starText.textContent || '');
    const n = getSerpCount(row, card);
    if (!xbar || !n) continue;

    const adj = bayesAdjusted(xbar, n);
    if (!adj) continue;

    infos.push({ card, row, adj, xbar, n });

    let badge = row.nextElementSibling && row.nextElementSibling.classList?.contains('arenh-badge')
      ? row.nextElementSibling
      : card.querySelector('.arenh-badge');

    if (!badge) {
      badge = makeBadge(adj, xbar, n, PRIOR_MEAN, PRIOR_WEIGHT);
      row.insertAdjacentElement('afterend', badge);
    } else {
      const star = badge.querySelector('.arenh-star');
      if (star) star.textContent = `${fmt(adj,2)}★`;
      const nEl = badge.querySelector('.arenh-key:last-child');
      if (nEl) nEl.textContent = `n=${n}`;
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

// ---------- Observer/boot ----------
let ticking = false;
const obs = new MutationObserver(() => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    try { enhancePDP(); } catch {}
    try { enhanceSearch(); } catch {}
    ticking = false;
  });
});

(function init() {
  try { enhancePDP(); } catch {}
  try { enhanceSearch(); } catch {}
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();

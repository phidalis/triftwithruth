// =============================================
// TRIFT WITH RUTH — Main App
// Firebase Firestore + Cloudinary + M-Pesa
// =============================================

import { db, auth } from './firebase-config.js';
import {
  collection, getDocs, addDoc, query, orderBy,
  onSnapshot, doc, getDoc, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ─────────────────────────────────────────────
// CLOUDINARY CONFIG (unsigned upload)
// Replace with your actual Cloudinary details
// ─────────────────────────────────────────────
const CLOUDINARY_CLOUD  = 'dx4bnc1bf';       // e.g. 'trift-with-ruth'
const CLOUDINARY_PRESET = 'trift_with_ruth_unsigned';    // unsigned preset name

// ─────────────────────────────────────────────
// M-PESA SERVER URL (your Render deployment)
// ─────────────────────────────────────────────
const MPESA_SERVER = 'https://your-render-app.onrender.com';

// ─────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────
let PRODUCTS   = [];
let HERO_SLIDES = [];
let SETTINGS   = {};
let cart       = JSON.parse(localStorage.getItem('twr_cart') || '[]');
let wishlist   = new Set(JSON.parse(localStorage.getItem('twr_wishlist') || '[]'));
let currentModal = null;
let selectedSize  = null;
let selectedColor = null;
let qty = 1;
let activeFilter = 'All';
let currentUser = null;

// ─────────────────────────────────────────────
// AUTH STATE
// ─────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateAuthUI(user);
});

function updateAuthUI(user) {
  const accountLink = document.getElementById('account-link');
  const mobileAccountLink = document.getElementById('mobile-account-link');
  if (user) {
    if (accountLink) accountLink.textContent = '👤 My Account';
    if (mobileAccountLink) mobileAccountLink.textContent = 'My Account';
  } else {
    if (accountLink) accountLink.textContent = '👤 Sign In';
    if (mobileAccountLink) mobileAccountLink.textContent = 'Sign In';
  }
}

// ─────────────────────────────────────────────
// CART PERSISTENCE
// ─────────────────────────────────────────────
function saveCart() {
  localStorage.setItem('twr_cart', JSON.stringify(cart));
  updateCartBadge();
}

function saveWishlist() {
  localStorage.setItem('twr_wishlist', JSON.stringify([...wishlist]));
}

function updateCartBadge() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'grid' : 'none';
  }
}

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
function showToast(msg, icon = '✨') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('exit');
    setTimeout(() => toast.remove(), 350);
  }, 3000);
}
window.showToast = showToast;

// ─────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────
function initLoader() {
  const loader = document.getElementById('page-loader');
  if (!loader) return;
  setTimeout(() => {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 500);
  }, 1200);
}

// ─────────────────────────────────────────────
// FETCH ALL STORE DATA
// ─────────────────────────────────────────────
async function fetchAllData() {
  try {
    const [productsSnap, slidesSnap, catsSnap, settingsSnap, videosSnap] = await Promise.all([
      getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'heroSlides'), orderBy('order', 'asc'))),
      getDocs(collection(db, 'categories')),
      getDoc(doc(db, 'settings', 'store')),
      getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc'))),
    ]);

    PRODUCTS = productsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.inStock !== false);

    HERO_SLIDES = slidesSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.active !== false);

    const CATEGORIES = catsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const VIDEOS = videosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (settingsSnap.exists()) {
      SETTINGS = settingsSnap.data();
      applySettings();
    }

    renderCategories(CATEGORIES);
    renderVideos(VIDEOS);

  } catch (err) {
    console.error('fetchAllData error:', err);
    showToast('Could not load store data. Check your connection.', '⚠️');
  }
}

function applySettings() {
  if (SETTINGS.marqueeText) {
    const items = SETTINGS.marqueeText.split('·').map(s => s.trim()).filter(Boolean);
    const track = document.getElementById('marquee-track');
    if (track && items.length) {
      track.innerHTML = [...items, ...items].map(t =>
        `<span class="marquee-item"><span class="marquee-dot"></span>${t}</span>`
      ).join('');
    }
  }
  if (SETTINGS.storeName) {
    document.title = `${SETTINGS.storeName} — Girls Fashion`;
  }
}

// ─────────────────────────────────────────────
// CATEGORIES RENDER
// ─────────────────────────────────────────────
function renderCategories(cats) {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  if (!cats || !cats.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted)">No categories yet.</div>';
    return;
  }
  grid.innerHTML = cats.map(c => `
    <div class="cat-card" onclick="filterByCategory('${c.name}')">
      <img src="${c.image || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80'}" alt="${c.name}" loading="lazy">
      <div class="cat-overlay">
        <div class="cat-name">${c.name}</div>
        <div class="cat-count">${c.description || ''}</div>
      </div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// VIDEO URL HELPERS
// Detects the type of URL and returns the right
// embed/player strategy: 'vimeo' | 'mp4' | 'image'
// ─────────────────────────────────────────────
function detectVideoType(url) {
  if (!url) return 'unknown';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/vimeo\.com/i.test(url)) return 'vimeo';
  if (/unsplash\.com|images\.unsplash/i.test(url)) return 'image';
  // Cloudinary video URLs end in video extensions or contain /video/upload/
  if (/\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || /\/video\/upload\//i.test(url)) return 'mp4';
  // Cloudinary image delivery URL
  if (/\/image\/upload\//i.test(url)) return 'image';
  // Fallback: assume mp4 for any other direct link
  return 'mp4';
}

// Extract Vimeo ID from any vimeo.com URL
function getVimeoId(url) {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

// Build a thumbnail from a Vimeo ID (uses vumbnail.com — no API key needed)
function vimeoThumb(id) {
  return id ? `https://vumbnail.com/${id}.jpg` : '';
}

// ─────────────────────────────────────────────
// VIDEOS RENDER
// ─────────────────────────────────────────────
function renderVideos(videos) {
  const grid = document.getElementById('video-grid');
  if (!grid) return;
  if (!videos || !videos.length) {
    grid.innerHTML = '<p style="color:var(--muted);padding:2rem;grid-column:1/-1">No videos yet. Add some in the admin panel!</p>';
    return;
  }

  const makeCard = (v) => {
    const url       = (v.url || '').trim();
    const safeUrl   = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const safeTitle = (v.title || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    const type      = detectVideoType(url);
    const vimeoId   = type === 'vimeo' ? getVimeoId(url) : null;
    const isIg      = type === 'instagram';

    let thumbSrc = v.thumbnail || '';
    if (!thumbSrc && vimeoId) thumbSrc = vimeoThumb(vimeoId);
    if (!thumbSrc && type === 'image') thumbSrc = url;

    const thumbHtml = thumbSrc
      ? `<img class="video-thumb" src="${thumbSrc}" alt="${safeTitle}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`
      : '';
    const fallbackHtml = `<div class="video-thumb" style="background:linear-gradient(135deg,var(--deep-rose),#8B3059);display:${thumbSrc ? 'none' : 'grid'};place-items:center;font-size:3rem;width:100%;height:100%">${isIg ? '📸' : '▶️'}</div>`;

    // Instagram badge (only for IG links)
    const igBadge = isIg
      ? `<div class="video-ig-badge">📸 Instagram</div>`
      : '';

    // Expand / collapse button — stops click propagating to play
    const expandBtn = `<button class="video-expand-btn" title="Expand" onclick="toggleVideoExpand(event,this)">⤢</button>`;

    return `
    <div class="video-card">
      <div class="video-card-inner"
           data-video-url="${safeUrl}"
           data-video-title="${safeTitle}"
           data-video-type="${type}"
           data-vimeo-id="${vimeoId || ''}"
           onclick="playVideo(this.dataset.videoUrl, this.dataset.videoTitle, this.dataset.videoType, this.dataset.vimeoId)">
        ${thumbHtml}${fallbackHtml}
        ${igBadge}
        ${expandBtn}
        <div class="video-overlay">
          <button class="play-btn" aria-label="Play video">▶</button>
          <div class="video-info">
            <span class="video-tag">${v.tag || 'Lookbook'}</span>
            <h3>${v.title || 'Untitled'}</h3>
            <p>${v.description || ''}</p>
          </div>
        </div>
      </div>
    </div>`;
  };

  grid.innerHTML = videos.map(v => makeCard(v)).join('');
}

// Toggle enlarge / collapse a video card
window.toggleVideoExpand = (e, btn) => {
  e.stopPropagation(); // don't trigger playVideo
  const card = btn.closest('.video-card');
  const expanded = card.classList.toggle('enlarged');
  btn.title    = expanded ? 'Collapse' : 'Expand';
  btn.textContent = expanded ? '⤡' : '⤢';
  if (expanded) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// Video lightbox — handles Vimeo embeds, direct mp4/Cloudinary, Instagram (opens tab), and image-only cards
window.playVideo = (url, title, type, vimeoId) => {
  if (!url) { console.warn('playVideo: no URL provided'); return; }
  // Resolve type if not passed
  if (!type) type = detectVideoType(url);
  if (!vimeoId && type === 'vimeo') vimeoId = getVimeoId(url);

  // Instagram: open the reel/post directly in a new tab — no embed possible
  if (type === 'instagram') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  document.getElementById('video-lightbox')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'video-lightbox';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:9500;display:grid;place-items:center;padding:1rem;cursor:pointer';

  let playerHtml = '';

  if (type === 'vimeo' && vimeoId) {
    playerHtml = `
      <iframe
        src="https://player.vimeo.com/video/${vimeoId}?autoplay=1&color=E8779A&title=0&byline=0&portrait=0"
        style="width:100%;aspect-ratio:16/9;border-radius:12px;border:none;background:#000"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        title="${title || 'Lookbook Video'}">
      </iframe>`;
  } else if (type === 'image') {
    playerHtml = `
      <img src="${url.replace(/"/g,'&quot;')}"
        style="max-width:100%;max-height:80vh;border-radius:12px;object-fit:contain"
        alt="${title || ''}">`;
  } else {
    playerHtml = `
      <video id="lightbox-video" controls autoplay playsinline
        style="width:100%;border-radius:12px;max-height:80vh;background:#000"
        src="${url.replace(/"/g,'&quot;')}">
        Your browser does not support HTML5 video.
      </video>`;
  }

  overlay.innerHTML = `
    <div style="position:relative;width:100%;max-width:900px;cursor:default" onclick="event.stopPropagation()">
      <button id="vlb-close-btn"
        style="position:absolute;top:-2.5rem;right:0;background:none;border:none;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1;z-index:10"
        aria-label="Close">✕</button>
      ${title ? `<p style="color:rgba(255,255,255,0.65);font-size:0.88rem;margin-bottom:0.6rem;font-family:'DM Sans',sans-serif">${title}</p>` : ''}
      ${playerHtml}
    </div>`;

  document.body.appendChild(overlay);

  const closeAll = () => {
    overlay.querySelector('#lightbox-video')?.pause();
    overlay.querySelector('iframe')?.setAttribute('src', '');
    overlay.remove();
  };

  overlay.addEventListener('click', closeAll);
  overlay.querySelector('#vlb-close-btn').addEventListener('click', closeAll);
};

// ─────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────
function initNavbar() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 50));

  const ham = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');
  const overlay = document.getElementById('nav-overlay');

  if (ham && mobileNav && overlay) {
    ham.addEventListener('click', () => {
      ham.classList.toggle('open');
      mobileNav.classList.toggle('open');
      overlay.classList.toggle('open');
      document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
    });
    overlay.addEventListener('click', () => {
      ham.classList.remove('open');
      mobileNav.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow = '';
      closeCart();
    });
  }
}

// ─────────────────────────────────────────────
// HERO CAROUSEL
// ─────────────────────────────────────────────
function initHero() {
  const slidesEl = document.getElementById('hero-slides');
  if (!slidesEl) return;

  if (!HERO_SLIDES.length) {
    slidesEl.innerHTML = `
      <div class="hero-slide active">
        <div class="hero-slide-bg" style="background:linear-gradient(135deg,var(--deep-rose),#8B3059)"></div>
        <div class="hero-slide-overlay"></div>
        <div class="hero-content">
          <span class="hero-tag">Welcome</span>
          <h1 class="hero-title">Trift with <em>Ruth</em></h1>
          <p class="hero-desc">Preloved girls fashion curated with love. Sustainable, stylish and always affordable.</p>
          <div class="hero-ctas"><a href="#products" class="hero-btn-primary">Shop Now</a></div>
        </div>
      </div>`;
    return;
  }

  let current = 0;
  let timer;

  slidesEl.innerHTML = HERO_SLIDES.map((s, i) => `
    <div class="hero-slide ${i === 0 ? 'active' : ''}">
      <div class="hero-slide-bg" style="background-image: url('${s.bg}')"></div>
      <div class="hero-slide-overlay"></div>
      <div class="hero-content">
        <span class="hero-tag">${s.tag || ''}</span>
        <h1 class="hero-title">${s.title || ''}</h1>
        <p class="hero-desc">${s.desc || ''}</p>
        <div class="hero-ctas">
          ${s.cta1 ? `<a href="#products" class="hero-btn-primary">${s.cta1}</a>` : ''}
          ${s.cta2 ? `<a href="#videos" class="hero-btn-ghost">${s.cta2}</a>` : ''}
        </div>
      </div>
    </div>`
  ).join('');

  const dotsEl = document.getElementById('hero-dots');
  if (dotsEl && HERO_SLIDES.length > 1) {
    dotsEl.innerHTML = HERO_SLIDES.map((_, i) =>
      `<div class="hero-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></div>`
    ).join('');
    dotsEl.querySelectorAll('.hero-dot').forEach(dot =>
      dot.addEventListener('click', () => goTo(+dot.dataset.i))
    );
  }

  function goTo(n) {
    const slides = slidesEl.querySelectorAll('.hero-slide');
    const dots   = dotsEl?.querySelectorAll('.hero-dot');
    slides[current].classList.remove('active');
    dots?.[current]?.classList.remove('active');
    current = (n + HERO_SLIDES.length) % HERO_SLIDES.length;
    slides[current].classList.add('active');
    dots?.[current]?.classList.add('active');
    // Translate the flex container so the correct slide is visible
    slidesEl.style.transform = `translateX(-${current * 100}%)`;
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  document.getElementById('hero-prev')?.addEventListener('click', () => goTo(current - 1));
  document.getElementById('hero-next')?.addEventListener('click', () => goTo(current + 1));
  timer = setInterval(() => goTo(current + 1), 5000);
}

// ─────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────
function initProducts() {
  renderFilters();
  renderProducts('All');
}

function renderFilters() {
  const container = document.getElementById('product-filters');
  if (!container) return;
  const cats = ['All', ...new Set(PRODUCTS.map(p => p.category).filter(Boolean))];
  container.innerHTML = cats.map(c =>
    `<button class="filter-btn ${c === 'All' ? 'active' : ''}" data-cat="${c}" onclick="window.renderProducts('${c}');document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.cat==='${c}'))">${c}</button>`
  ).join('');
}

window.renderProducts = (filter = 'All') => {
  activeFilter = filter;
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  const filtered = filter === 'All' ? PRODUCTS : PRODUCTS.filter(p => p.category === filter);
  if (!filtered.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--muted)">No products found in this category.</div>';
    return;
  }
  grid.innerHTML = filtered.map(p => {
    const img   = (p.images && p.images[0]) || '';
    const hasVideo = p.videos && p.videos.length > 0;
    const save  = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    return `
      <div class="product-card" onclick="openModal('${p.id}')">
        <div class="product-img-wrap">
          ${img
            ? `<img src="${img}" alt="${p.name}" loading="lazy" class="product-img">`
            : `<div class="product-img" style="background:var(--petal);display:grid;place-items:center;font-size:3rem">👗</div>`
          }
          ${hasVideo ? `<div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.55);color:#fff;border-radius:6px;padding:2px 8px;font-size:0.7rem;font-weight:700">▶ Video</div>` : ''}
          ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
          ${save > 0 ? `<span class="product-badge" style="top:auto;bottom:8px;right:8px;background:var(--deep-rose)">-${save}%</span>` : ''}
          <button class="wishlist-btn ${wishlist.has(p.id) ? 'active' : ''}" onclick="event.stopPropagation();toggleWishlist('${p.id}',this)" aria-label="Wishlist">
            ${wishlist.has(p.id) ? '❤️' : '🤍'}
          </button>
        </div>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <div class="product-price-row">
            <span class="product-price">KSh ${(p.price || 0).toLocaleString()}</span>
            ${p.oldPrice ? `<span class="product-price-old">KSh ${p.oldPrice.toLocaleString()}</span>` : ''}
          </div>
          <button class="add-to-cart-btn" onclick="event.stopPropagation();quickAddToCart('${p.id}')">Add to Cart</button>
        </div>
      </div>`;
  }).join('');
}

window.toggleWishlist = (id, btn) => {
  if (wishlist.has(id)) {
    wishlist.delete(id);
    if (btn) btn.innerHTML = '🤍';
    if (btn) btn.classList.remove('active');
    showToast('Removed from wishlist', '🤍');
  } else {
    wishlist.add(id);
    if (btn) btn.innerHTML = '❤️';
    if (btn) btn.classList.add('active');
    showToast('Added to wishlist!', '❤️');
  }
  saveWishlist();
};

window.quickAddToCart = (id) => {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;
  if ((product.sizes || []).length > 0) {
    openModal(id);
    return;
  }
  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id, name: product.name, price: product.price,
      image: (product.images || [])[0] || '', size: null, color: null, qty: 1,
    });
  }
  saveCart();
  showToast(`${product.name} added to cart!`, '🛍️');
};

// ─────────────────────────────────────────────
// PRODUCT MODAL
// ─────────────────────────────────────────────
window.openModal = async (id) => {
  let product = PRODUCTS.find(p => p.id === id);
  if (!product) {
    try {
      const snap = await getDoc(doc(db, 'products', id));
      if (snap.exists()) product = { id: snap.id, ...snap.data() };
    } catch { return; }
  }
  if (!product) return;

  currentModal = product;
  selectedSize  = null;
  selectedColor = null;
  qty = 1;

  document.getElementById('modal-title').textContent = product.name;
  document.getElementById('modal-price').textContent = `KSh ${(product.price || 0).toLocaleString()}`;
  document.getElementById('modal-badge').textContent = product.badge || '';
  document.getElementById('modal-desc').textContent  = product.description || '';
  document.getElementById('modal-qty').textContent   = '1';

  const oldEl = document.getElementById('modal-price-old');
  const saveEl = document.getElementById('modal-save');
  if (product.oldPrice) {
    oldEl.textContent = `KSh ${product.oldPrice.toLocaleString()}`;
    const pct = Math.round((1 - product.price / product.oldPrice) * 100);
    saveEl.textContent = `Save ${pct}%`;
  } else {
    oldEl.textContent = '';
    saveEl.textContent = '';
  }

  // Gallery: images + videos
  const heroImg   = document.getElementById('modal-hero-img');
  const heroVideo = document.getElementById('modal-hero-video');
  const allMedia  = [
    ...(product.images || []).map(u => ({ type: 'image', url: u })),
    ...(product.videos || []).map(u => ({ type: 'video', url: u })),
  ];

  if (allMedia.length) {
    const first = allMedia[0];
    if (first.type === 'video') {
      heroImg.style.display = 'none';
      heroVideo.style.display = '';
      heroVideo.src = first.url;
    } else {
      heroVideo.style.display = 'none';
      heroImg.style.display = '';
      heroImg.src = first.url;
    }
  } else {
    heroImg.src = '';
    heroVideo.style.display = 'none';
  }

  const thumbs = document.getElementById('modal-thumbs');
  thumbs.innerHTML = allMedia.map((m, i) => `
    <div class="modal-thumb ${i === 0 ? 'active' : ''}" onclick="switchModalMedia(${i}, ${JSON.stringify(allMedia).replace(/"/g,'&quot;')})">
      ${m.type === 'video'
        ? `<div style="width:60px;height:60px;background:var(--charcoal);border-radius:6px;display:grid;place-items:center;color:#fff;font-size:1rem">▶</div>`
        : `<img src="${m.url}" style="width:60px;height:60px;object-fit:cover;border-radius:6px">`
      }
    </div>
  `).join('');

  // Sizes
  const sizesEl = document.getElementById('modal-sizes');
  sizesEl.innerHTML = (product.sizes || []).map(s =>
    `<button class="size-btn" onclick="selectSize('${s}',this)">${s}</button>`
  ).join('');

  // Colors
  const colorsEl = document.getElementById('modal-colors');
  colorsEl.innerHTML = (product.colors || []).map(c =>
    `<div class="color-dot" style="background:${c}" onclick="selectColor('${c}',this)" title="${c}"></div>`
  ).join('');

  // Wishlist state
  document.getElementById('modal-wishlist-btn').innerHTML = wishlist.has(id) ? '❤️' : '🤍';

  // Category suggestions
  const suggestionsEl  = document.getElementById('modal-suggestions');
  const suggestionsRow = document.getElementById('modal-suggestions-row');
  const suggestionsTitle = document.getElementById('modal-suggestions-title');
  if (suggestionsEl && suggestionsRow && product.category) {
    const related = PRODUCTS.filter(p => p.id !== product.id && p.category === product.category).slice(0, 8);
    if (related.length > 0) {
      suggestionsTitle.textContent = `More from ${product.category}`;
      suggestionsRow.innerHTML = related.map(p => {
        const img = (p.images && p.images[0]) || '';
        return `
          <div class="modal-suggestion-card" onclick="openModal('${p.id}')">
            ${img
              ? `<img src="${img}" alt="${p.name}" loading="lazy">`
              : `<div class="modal-suggestion-card-no-img">👗</div>`
            }
            <div class="modal-suggestion-info">
              <div class="modal-suggestion-name">${p.name}</div>
              <div class="modal-suggestion-price">KSh ${(p.price || 0).toLocaleString()}</div>
            </div>
          </div>`;
      }).join('');
      suggestionsEl.style.display = '';
    } else {
      suggestionsEl.style.display = 'none';
    }
  } else if (suggestionsEl) {
    suggestionsEl.style.display = 'none';
  }

  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.switchModalMedia = (idx, mediaArr) => {
  const m = mediaArr[idx];
  const heroImg   = document.getElementById('modal-hero-img');
  const heroVideo = document.getElementById('modal-hero-video');
  if (m.type === 'video') {
    heroImg.style.display = 'none';
    heroVideo.style.display = '';
    heroVideo.src = m.url;
  } else {
    heroVideo.style.display = 'none';
    heroImg.style.display = '';
    heroImg.src = m.url;
  }
  document.querySelectorAll('.modal-thumb').forEach((t, i) =>
    t.classList.toggle('active', i === idx)
  );
};

// Legacy switchModalImg for backward compat
window.switchModalImg = (src, el) => {
  const heroImg = document.getElementById('modal-hero-img');
  if (heroImg) heroImg.src = src;
  document.querySelectorAll('.modal-thumb').forEach(t => t.classList.remove('active'));
  el?.classList.add('active');
};

window.closeModal = () => {
  document.getElementById('modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  const heroVideo = document.getElementById('modal-hero-video');
  if (heroVideo) { heroVideo.pause(); heroVideo.src = ''; }
};

window.selectSize = (size, btn) => {
  selectedSize = size;
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
};

window.selectColor = (color, el) => {
  selectedColor = color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  el?.classList.add('active');
};

window.changeQty = (delta) => {
  qty = Math.max(1, qty + delta);
  const el = document.getElementById('modal-qty');
  if (el) el.textContent = qty;
};

window.addToCart = () => {
  if (!currentModal) return;
  if ((currentModal.sizes || []).length > 0 && !selectedSize) {
    showToast('Please select a size', '⚠️');
    return;
  }
  const existing = cart.find(i =>
    i.id === currentModal.id && i.size === selectedSize && i.color === selectedColor
  );
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      id:    currentModal.id,
      name:  currentModal.name,
      price: currentModal.price,
      image: (currentModal.images || [])[0] || '',
      size:  selectedSize,
      color: selectedColor,
      qty,
    });
  }
  saveCart();
  showToast(`${currentModal.name} added to cart!`, '🛍️');
  closeModal();
};

window.toggleModalWishlist = () => {
  if (!currentModal) return;
  const btn = document.getElementById('modal-wishlist-btn');
  if (wishlist.has(currentModal.id)) {
    wishlist.delete(currentModal.id);
    if (btn) btn.innerHTML = '🤍';
    showToast('Removed from wishlist', '🤍');
  } else {
    wishlist.add(currentModal.id);
    if (btn) btn.innerHTML = '❤️';
    showToast('Added to wishlist!', '❤️');
  }
  saveWishlist();
};

// ─────────────────────────────────────────────
// CART DRAWER
// ─────────────────────────────────────────────
function initCart() {
  updateCartBadge();
  document.getElementById('cart-btn')?.addEventListener('click', openCart);
}

function openCart() {
  renderCartItems();
  document.getElementById('cart-drawer')?.classList.add('open');
  document.getElementById('nav-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('cart-drawer')?.classList.remove('open');
  document.getElementById('nav-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}
window.closeCart = closeCart;

function renderCartItems() {
  const body    = document.getElementById('cart-body');
  const totalEl = document.getElementById('cart-total');

  if (cart.length === 0) {
    body.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛍️</div>
        <p>Your cart is empty</p>
        <p style="font-size:0.82rem;margin-top:0.5rem;color:var(--muted)">Add some gorgeous pieces!</p>
      </div>`;
    if (totalEl) totalEl.textContent = 'KSh 0';
    return;
  }

  body.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <img class="cart-item-img" src="${item.image}" alt="${item.name}">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-size">${item.size ? `Size: ${item.size} · ` : ''}Qty: ${item.qty}</div>
        <div class="cart-item-price">KSh ${(item.price * item.qty).toLocaleString()}</div>
      </div>
      <button class="cart-item-remove" onclick="removeCartItem(${i})">✕</button>
    </div>`
  ).join('');

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee = SETTINGS.deliveryFee || 300;
  const freeAbove   = SETTINGS.freeDeliveryAbove || 3000;
  const finalDelivery = subtotal >= freeAbove ? 0 : deliveryFee;
  const total = subtotal + finalDelivery;

  if (totalEl) totalEl.textContent = `KSh ${total.toLocaleString()}`;

  const deliveryEl = document.getElementById('cart-delivery-info');
  if (deliveryEl) {
    if (subtotal >= freeAbove) {
      deliveryEl.textContent = '✅ Free delivery on this order!';
      deliveryEl.style.color = '#27AE60';
    } else {
      const remaining = freeAbove - subtotal;
      deliveryEl.textContent = `Add KSh ${remaining.toLocaleString()} more for free delivery`;
      deliveryEl.style.color = 'var(--muted)';
    }
  }
}

window.removeCartItem = (idx) => {
  cart.splice(idx, 1);
  saveCart();
  renderCartItems();
  showToast('Item removed', '🗑️');
};

// ─────────────────────────────────────────────
// CHECKOUT — M-Pesa STK Push
// ─────────────────────────────────────────────
window.checkout = () => {
  if (!cart.length) { showToast('Your cart is empty', '⚠️'); return; }
  if (!currentUser) {
    showToast('Please sign in to place an order', '⚠️');
    closeCart();
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
    return;
  }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee = SETTINGS.deliveryFee || 300;
  const freeAbove   = SETTINGS.freeDeliveryAbove || 3000;
  const finalDelivery = subtotal >= freeAbove ? 0 : deliveryFee;
  const total = subtotal + finalDelivery;

  // Pre-fill phone from profile if available
  const savedPhone = localStorage.getItem('twr_phone') || '';
  document.getElementById('mpesa-phone').value = savedPhone;
  document.getElementById('mpesa-subtotal').textContent = `KSh ${subtotal.toLocaleString()}`;
  document.getElementById('mpesa-delivery').textContent = finalDelivery === 0 ? 'FREE' : `KSh ${finalDelivery.toLocaleString()}`;
  document.getElementById('mpesa-total').textContent    = `KSh ${total.toLocaleString()}`;
  document.getElementById('mpesa-status').style.display = 'none';

  closeCart();
  const modal = document.getElementById('mpesa-modal-overlay');
  modal.style.display = 'grid';
};

window.closeMpesaModal = () => {
  document.getElementById('mpesa-modal-overlay').style.display = 'none';
};

window.confirmMpesaPayment = async () => {
  const phone   = document.getElementById('mpesa-phone').value.trim();
  const address = document.getElementById('mpesa-address').value.trim();

  if (!phone) { showToast('Please enter your M-Pesa number', '⚠️'); return; }
  if (!address) { showToast('Please enter delivery address', '⚠️'); return; }

  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee = SETTINGS.deliveryFee || 300;
  const freeAbove   = SETTINGS.freeDeliveryAbove || 3000;
  const finalDelivery = subtotal >= freeAbove ? 0 : deliveryFee;
  const total = subtotal + finalDelivery;

  const btn    = document.getElementById('mpesa-pay-btn');
  const status = document.getElementById('mpesa-status');
  btn.disabled = true;
  btn.textContent = '⏳ Sending…';
  status.style.display = 'none';

  // Save order first (pending payment)
  let orderId;
  try {
    const orderRef = await addDoc(collection(db, 'orders'), {
      customerId:      currentUser.uid,
      customerEmail:   currentUser.email,
      customerName:    currentUser.displayName || currentUser.email,
      items:           cart,
      subtotal,
      deliveryFee:     finalDelivery,
      total,
      deliveryAddress: address,
      phone,
      status:          'pending_payment',
      paymentMethod:   'mpesa',
      createdAt:       serverTimestamp(),
    });
    orderId = orderRef.id;
    // Save phone for next time
    localStorage.setItem('twr_phone', phone);
  } catch (err) {
    showToast('Could not create order: ' + err.message, '❌');
    btn.disabled = false;
    btn.textContent = '💚 Send STK Push';
    return;
  }

  // Trigger STK push
  try {
    const res = await fetch(`${MPESA_SERVER}/mpesa/stkpush`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, amount: total, orderId, customerName: currentUser.displayName }),
    });
    const data = await res.json();

    if (data.success) {
      status.style.display = 'block';
      status.style.color = '#27AE60';
      status.textContent = '✅ Check your phone! Enter your M-Pesa PIN to complete payment.';
      btn.textContent = '✅ STK Sent';

      // Clear cart after successful STK push
      cart = [];
      saveCart();

      // Poll for status after 30s
      setTimeout(async () => {
        if (data.checkoutRequestID) {
          try {
            const qRes = await fetch(`${MPESA_SERVER}/mpesa/query`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ checkoutRequestID: data.checkoutRequestID }),
            });
            const qData = await qRes.json();
            if (qData.success) {
              const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
              await updateDoc(doc(db, 'orders', orderId), { status: 'confirmed', paidAt: serverTimestamp() });
              showToast('Payment confirmed! 🎉 Order is being processed.', '✅');
            }
          } catch { /* silent */ }
        }
        closeMpesaModal();
      }, 30000);

    } else {
      status.style.display = 'block';
      status.style.color = '#E74C3C';
      status.textContent = '❌ ' + (data.message || 'Payment failed. Try again.');
      btn.disabled = false;
      btn.textContent = '💚 Send STK Push';
    }
  } catch (err) {
    status.style.display = 'block';
    status.style.color = '#E74C3C';
    status.textContent = '❌ Server error. Please try again.';
    btn.disabled = false;
    btn.textContent = '💚 Send STK Push';
  }
};

// ─────────────────────────────────────────────
// SCROLL REVEAL
// ─────────────────────────────────────────────
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('visible'), i * 80);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => obs.observe(el));
}

// ─────────────────────────────────────────────
// NEWSLETTER
// ─────────────────────────────────────────────
function initNewsletter() {
  const form = document.getElementById('newsletter-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('input').value;
    if (email) {
      try {
        await addDoc(collection(db, 'subscribers'), { email, subscribedAt: serverTimestamp() });
      } catch { /* ok */ }
      showToast('Thank you for subscribing! ✨', '💌');
      form.querySelector('input').value = '';
    }
  });
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initLoader();
  initNavbar();
  initCart();
  initScrollReveal();
  initNewsletter();

  await fetchAllData();
  initHero();
  initProducts();

  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeCart(); closeMpesaModal(); }
  });
});

// Expose globals
window.openModal          = window.openModal;
window.closeModal         = window.closeModal;
window.switchModalImg     = window.switchModalImg;
window.switchModalMedia   = window.switchModalMedia;
window.selectSize         = window.selectSize;
window.selectColor        = window.selectColor;
window.changeQty          = window.changeQty;
window.addToCart          = window.addToCart;
window.toggleModalWishlist = window.toggleModalWishlist;
window.removeCartItem     = window.removeCartItem;
window.toggleWishlist     = window.toggleWishlist;
window.renderProducts     = window.renderProducts;
window.quickAddToCart     = window.quickAddToCart;
window.checkout           = window.checkout;
window.closeMpesaModal    = window.closeMpesaModal;
window.confirmMpesaPayment = window.confirmMpesaPayment;
window.playVideo          = window.playVideo;

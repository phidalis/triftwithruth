// =============================================
// TRIFT WITH RUTH — Admin Panel
// Firebase + Cloudinary Unsigned Uploads
// =============================================

import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ─────────────────────────────────────────────
// CLOUDINARY CONFIG — Unsigned Upload
// Replace with your Cloudinary details
// ─────────────────────────────────────────────
const CLOUDINARY_CLOUD  = 'dx4bnc1bf';     // e.g. 'trift-with-ruth'
const CLOUDINARY_PRESET = 'trift_with_ruth_unsigned';  // unsigned preset name

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY_PRESET);
  fd.append('folder', 'trift-with-ruth');

  const isVideo = file.type.startsWith('video/');
  const endpoint = isVideo
    ? `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/video/upload`
    : `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

  const res = await fetch(endpoint, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const data = await res.json();
  return data.secure_url;
}

// ─────────────────────────────────────────────
// TOAST FUNCTION
// ─────────────────────────────────────────────
function showAdminToast(msg, type = 'success') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const container = document.getElementById('admin-toast');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${icons[type]||'✨'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('exit'); setTimeout(() => el.remove(), 350); }, 4000);
}

// ─────────────────────────────────────────────
// FLAG to prevent multiple initialization
// ─────────────────────────────────────────────
let isInitialized = false;

onAuthStateChanged(auth, async (user) => {
  console.log("Admin panel: Auth state changed", user?.email);
  
  if (!user) {
    console.log("No user found, redirecting to login");
    isInitialized = false;
    window.location.href = 'admin-login.html';
    return;
  }
  
  // Check if user is admin from admins collection
  try {
    console.log("Checking admin status for UID:", user.uid);
    const adminDocRef = doc(db, 'admins', user.uid);
    const adminDoc = await getDoc(adminDocRef);
    
    console.log("Admin document exists:", adminDoc.exists());
    
    if (!adminDoc.exists()) {
      console.log("User is not an admin, signing out");
      await signOut(auth);
      window.location.href = 'admin-login.html';
      return;
    }
    
    // ONLY INITIALIZE ONCE - This fixes the loop
    if (!isInitialized) {
      console.log("Admin verified, initializing panel");
      const displayName = user.displayName || user.email;
      const nameEl = document.getElementById('admin-user-name');
      const avatarEl = document.getElementById('admin-avatar-letter');
      if (nameEl) nameEl.textContent = displayName;
      if (avatarEl) avatarEl.textContent = displayName[0].toUpperCase();
      initAdmin();
      isInitialized = true;
    }
  } catch (err) {
    console.error('Admin check error:', err);
    showAdminToast('Error verifying admin: ' + err.message, 'error');
  }
});

document.getElementById('admin-signout-btn')?.addEventListener('click', async () => {
  isInitialized = false;
  await signOut(auth);
  window.location.href = 'admin-login.html';
});

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function initAdmin() {
  initSidebarNav();
  initSidebarToggle();
  loadDashboard();
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────
function initSidebarNav() {
  document.querySelectorAll('.sidebar-nav li a[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.sidebar-nav li a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');
      showSection(link.dataset.section);
    });
  });
}

function showSection(section) {
  document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
  const el = document.getElementById('section-' + section);
  if (el) el.style.display = '';

  document.querySelector('.page-heading').textContent = {
    dashboard: 'Dashboard', orders: 'Orders', customers: 'Customers',
    products: 'Products', 'add-product': 'Add Product',
    categories: 'Categories', 'hero-slides': 'Hero Slides',
    promotions: 'Promotions', settings: 'Store Settings', videos: 'Lookbook Videos',
  }[section] || section;

  switch (section) {
    case 'dashboard':   loadDashboard(); break;
    case 'orders':      loadOrders(); break;
    case 'customers':   loadCustomers(); break;
    case 'products':    loadProducts(); break;
    case 'add-product': initProductForm(); break;
    case 'categories':  loadCategories(); break;
    case 'hero-slides': loadHeroSlides(); break;
    case 'promotions':  loadPromotions(); break;
    case 'settings':    loadSettings(); break;
    case 'videos':      loadVideos(); break;
  }
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [ordersSnap, productsSnap, customersSnap] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'users')),
    ]);

    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const totalRevenue = orders
      .filter(o => o.status !== 'cancelled' && o.status !== 'pending_payment')
      .reduce((s, o) => s + (o.total || 0), 0);
    const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'pending_payment').length;

    document.getElementById('stat-revenue').textContent  = `KSh ${totalRevenue.toLocaleString()}`;
    document.getElementById('stat-orders').textContent   = orders.length;
    document.getElementById('stat-products').textContent = productsSnap.size;
    document.getElementById('stat-customers').textContent = customersSnap.size;
    document.getElementById('stat-pending').textContent  = `${pendingCount} pending`;

    const recent = orders
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .slice(0, 5);
    renderRecentOrdersTable(recent);
    renderWeeklyChart(orders);
  } catch (err) {
    showAdminToast('Dashboard error: ' + err.message, 'error');
  }
}

function renderWeeklyChart(orders) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const totals = Array(7).fill(0);
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  orders.forEach(o => {
    const date = o.createdAt?.toDate?.() || new Date(o.createdAt || 0);
    if (date >= weekAgo) totals[date.getDay()] += (o.total || 0);
  });
  const max = Math.max(...totals, 1);
  const barsEl = document.getElementById('revenue-bars');
  if (!barsEl) return;
  barsEl.innerHTML = days.map((day, i) => `
    <div class="chart-bar-wrap">
      <div class="chart-bar" style="height:0" data-h="${(totals[i]/max)*90}"></div>
      <span class="chart-label">${day}</span>
    </div>`).join('');
  setTimeout(() => {
    barsEl.querySelectorAll('.chart-bar').forEach(bar => { bar.style.height = bar.dataset.h + 'px'; });
  }, 200);
}

function renderRecentOrdersTable(orders) {
  const tbody = document.getElementById('dashboard-orders-tbody');
  if (!tbody) return;
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">No orders yet</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td style="font-weight:700;color:var(--deep-rose)">#${o.id.slice(-6).toUpperCase()}</td>
      <td>${o.customerName || o.customerEmail || '—'}</td>
      <td style="color:var(--muted);font-size:0.85rem">${formatDate(o.createdAt)}</td>
      <td style="font-weight:700">KSh ${(o.total||0).toLocaleString()}</td>
      <td><span class="badge badge-${statusBadge(o.status)}">${o.status || 'pending'}</span></td>
      <td><button class="action-btn edit" onclick="window.viewOrderDetails('${o.id}')" title="View">👁️</button></td>
    </tr>`).join('');
}

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────
let allOrders = [];
async function loadOrders() {
  const tbody = document.getElementById('orders-tbody-main');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem">Loading...</td></tr>';
  try {
    const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
    allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOrdersTable(allOrders);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:red;padding:1rem">${err.message}</td></tr>`;
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('orders-tbody-main');
  if (!tbody) return;
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--muted)">No orders found</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td style="font-weight:700;color:var(--deep-rose)">#${o.id.slice(-6).toUpperCase()}</td>
      <td>${o.customerName || '—'}</td>
      <td>${o.customerEmail || '—'}</td>
      <td style="color:var(--muted);font-size:0.85rem">${formatDate(o.createdAt)}</td>
      <td style="font-weight:700">KSh ${(o.total||0).toLocaleString()}</td>
      <td>
        <select class="order-status-select" onchange="updateOrderStatus('${o.id}', this.value)">
          ${['pending','pending_payment','confirmed','shipped','delivered','cancelled'].map(s =>
            `<option value="${s}" ${o.status===s?'selected':''}>${s.replace('_',' ')}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="window.viewOrderDetails('${o.id}')" title="View">👁️</button>
          <button class="action-btn del" onclick="window.deleteOrder('${o.id}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

window.updateOrderStatus = async (id, status) => {
  try {
    await updateDoc(doc(db, 'orders', id), { status, updatedAt: serverTimestamp() });
    showAdminToast(`Status updated to "${status}"`, 'success');
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
};

window.viewOrderDetails = async (id) => {
  try {
    const snap = await getDoc(doc(db, 'orders', id));
    if (!snap.exists()) return;
    const o = { id: snap.id, ...snap.data() };
    const items = (o.items || []).map(i => `
      <div style="display:flex;gap:0.75rem;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--petal)">
        <img src="${i.image || ''}" style="width:50px;height:50px;object-fit:cover;border-radius:8px;background:var(--petal)">
        <div style="flex:1">
          <div style="font-weight:600">${i.name}</div>
          <div style="font-size:0.8rem;color:var(--muted)">Size: ${i.size || '—'} · Qty: ${i.qty}</div>
        </div>
        <div style="font-weight:700">KSh ${((i.price||0)*(i.qty||1)).toLocaleString()}</div>
      </div>`).join('');
    showModal(`Order #${id.slice(-6).toUpperCase()}`,
      `<p style="margin-bottom:0.5rem;font-size:0.9rem"><strong>${o.customerName||'—'}</strong> · ${o.customerEmail||''}</p>
       <p style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--muted)">📍 ${o.deliveryAddress || '—'}</p>
       <p style="margin-bottom:0.5rem;font-size:0.9rem;color:var(--muted)">📱 ${o.phone || '—'}</p>
       <p style="margin-bottom:1rem;font-size:0.85rem;color:var(--muted)">🗓 ${formatDate(o.createdAt)} · 💳 ${o.paymentMethod || 'mpesa'}</p>
       ${items}
       <div style="margin-top:1rem;display:flex;justify-content:space-between;font-size:0.9rem">
         <span style="color:var(--muted)">Delivery:</span><span>KSh ${(o.deliveryFee||0).toLocaleString()}</span>
       </div>
       <div style="margin-top:0.5rem;font-weight:800;font-size:1.1rem;text-align:right;color:var(--deep-rose)">
         Total: KSh ${(o.total||0).toLocaleString()}
       </div>`
    );
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
};

window.deleteOrder = async (id) => {
  if (!confirm('Delete this order?')) return;
  try {
    await deleteDoc(doc(db, 'orders', id));
    showAdminToast('Order deleted', 'warning');
    loadOrders();
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
};

document.getElementById('order-search')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  const filtered = allOrders.filter(o =>
    (o.customerName||'').toLowerCase().includes(q) ||
    (o.customerEmail||'').toLowerCase().includes(q) ||
    o.id.toLowerCase().includes(q)
  );
  renderOrdersTable(filtered);
});

document.getElementById('order-status-filter')?.addEventListener('change', e => {
  const val = e.target.value;
  renderOrdersTable(val ? allOrders.filter(o => o.status === val) : allOrders);
});

// ─────────────────────────────────────────────
// CUSTOMERS
// ─────────────────────────────────────────────
async function loadCustomers() {
  const tbody = document.getElementById('customers-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem">Loading...</td></tr>';
  try {
    const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted)">No customers yet</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.75rem">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--rose),var(--deep-rose));display:grid;place-items:center;color:#fff;font-weight:700;font-size:0.85rem;flex-shrink:0">
              ${(u.firstName||u.email||'?')[0].toUpperCase()}
            </div>
            <div>
              <div style="font-weight:600">${u.firstName ? u.firstName+' '+u.lastName : '—'}</div>
              <div style="font-size:0.75rem;color:var(--muted)">${u.email||'—'}</div>
            </div>
          </div>
        </td>
        <td style="font-size:0.85rem;color:var(--muted)">${u.phone||'—'}</td>
        <td style="font-size:0.85rem;color:var(--muted)">${formatDate(u.createdAt)}</td>
        <td style="font-weight:700">KSh ${(u.totalSpent||0).toLocaleString()}</td>
        <td><span class="badge badge-${u.orders>0?'active':'draft'}">${u.orders||0} orders</span></td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:red;padding:1rem">${err.message}</td></tr>`;
  }
}

// ─────────────────────────────────────────────
// PRODUCTS LIST
// ─────────────────────────────────────────────
let allProducts = [];

async function loadProducts() {
  const tbody = document.getElementById('products-tbody-main');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">Loading...</td></tr>';
  try {
    const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc')));
    allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProductsTable(allProducts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:red;padding:1rem">${err.message}</td></tr>`;
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-tbody-main');
  if (!tbody) return;
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">No products yet</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => {
    const img = (p.images||[])[0] || '';
    const hasVideo = (p.videos||[]).length > 0;
    return `
    <tr>
      <td>
        <div class="td-product">
          ${img
            ? `<img class="td-product-img" src="${img}" alt="${p.name}">`
            : `<div class="td-product-img" style="background:var(--petal);display:grid;place-items:center;font-size:1.2rem">👗</div>`
          }
          <div>
            <div class="td-product-name">${p.name}</div>
            <div class="td-product-sku">${p.category||'—'}${hasVideo ? ' · 🎬 video' : ''}</div>
          </div>
        </div>
      </td>
      <td>${p.category||'—'}</td>
      <td>KSh ${(p.price||0).toLocaleString()}</td>
      <td>${p.stock ?? (p.inStock ? 'In Stock' : 'Out')}</td>
      <td><span class="badge badge-${p.inStock?'active':'sold'}">${p.inStock?'Active':'Sold Out'}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="window.editProduct('${p.id}')">✏️</button>
          <button class="action-btn del" onclick="window.deleteProduct('${p.id}')">🗑️</button>
        </div>
      </td>
    </tr>`; }).join('');
}

document.getElementById('product-search-main')?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderProductsTable(allProducts.filter(p =>
    p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
  ));
});

window.deleteProduct = async (id) => {
  if (!confirm('Delete this product permanently?')) return;
  try {
    await deleteDoc(doc(db, 'products', id));
    showAdminToast('Product deleted', 'warning');
    loadProducts();
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
};

window.editProduct = async (id) => {
  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return;
  const p = { id: snap.id, ...snap.data() };
  showSection('add-product');
  document.querySelector('.sidebar-nav li a[data-section="add-product"]')?.classList.add('active');
  populateProductForm(p);
};

// ─────────────────────────────────────────────
// ADD / EDIT PRODUCT FORM — Cloudinary uploads
// ─────────────────────────────────────────────
let uploadedImageFiles = [];
let uploadedVideoFiles = [];
let editingProductId   = null;

function initProductForm() {
  editingProductId    = null;
  uploadedImageFiles  = [];
  uploadedVideoFiles  = [];
  document.getElementById('product-form')?.reset();
  document.getElementById('upload-previews').innerHTML = '';
  document.getElementById('video-previews').innerHTML  = '';
  document.getElementById('form-submit-btn').textContent = 'Save Product';

  const form = document.getElementById('product-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', handleProductSubmit);

  // Set up dropzones AFTER the form is replaced so event bindings are fresh
  setupDropzone('upload-zone', 'file-input', 'image/*', handleImageFiles);
  setupDropzone('video-zone', 'video-input', 'video/*', handleVideoFiles);

  loadCategoriesForSelect();
}

function setupDropzone(zoneId, inputId, accept, handler) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;
  input.accept = accept;
  zone.onclick = () => input.click();
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('drag-over'); };
  zone.ondragleave = () => zone.classList.remove('drag-over');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('drag-over'); handler(e.dataTransfer.files); };
  input.onchange = () => handler(input.files);
}

function handleImageFiles(files) {
  const previews = document.getElementById('upload-previews');
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    uploadedImageFiles.push(file);
    const reader = new FileReader();
    reader.onload = e => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.dataset.filename = file.name;
      item.innerHTML = `
        <img src="${e.target.result}" alt="">
        <button class="preview-remove" type="button" onclick="removeNewImageFile('${file.name}',this)">✕</button>`;
      previews.appendChild(item);
    };
    reader.readAsDataURL(file);
  });
}

function handleVideoFiles(files) {
  const previews = document.getElementById('video-previews');
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('video/')) return;
    uploadedVideoFiles.push(file);
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.dataset.filename = file.name;
    item.innerHTML = `
      <div style="background:var(--charcoal);border-radius:8px;display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;color:#fff;font-size:0.82rem">
        🎬 <span>${file.name}</span>
      </div>
      <button class="preview-remove" type="button" onclick="removeNewVideoFile('${file.name}',this)" style="top:4px;right:4px">✕</button>`;
    previews.appendChild(item);
  });
}

window.removeNewImageFile = (name, btn) => {
  uploadedImageFiles = uploadedImageFiles.filter(f => f.name !== name);
  btn.parentElement.remove();
};
window.removeNewVideoFile = (name, btn) => {
  uploadedVideoFiles = uploadedVideoFiles.filter(f => f.name !== name);
  btn.parentElement.remove();
};
window.removeExistingImage = (btn) => btn.parentElement.remove();
window.removeExistingVideo = (btn) => btn.parentElement.remove();

async function loadCategoriesForSelect() {
  const sel = document.getElementById('p-category');
  if (!sel) return;
  try {
    const snap = await getDocs(collection(db, 'categories'));
    const cats = snap.docs.map(d => d.data().name).filter(Boolean);
    const defaults = ['Dresses','Tops','Skirts','Knitwear','Outerwear','Accessories'];
    const all = [...new Set([...defaults, ...cats])];
    const cur = sel.value;
    sel.innerHTML = '<option value="">Select category</option>' +
      all.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
  } catch { /* use defaults */ }
}

function populateProductForm(p) {
  editingProductId = p.id;
  document.getElementById('p-name').value        = p.name || '';
  document.getElementById('p-category').value    = p.category || '';
  document.getElementById('p-price').value       = p.price || '';
  document.getElementById('p-old-price').value   = p.oldPrice || '';
  document.getElementById('p-sizes').value       = (p.sizes||[]).join(', ');
  document.getElementById('p-badge').value       = p.badge || '';
  document.getElementById('p-description').value = p.description || '';
  document.getElementById('p-stock').value       = p.stock ?? '';
  document.getElementById('p-in-stock').checked  = p.inStock !== false;
  document.getElementById('form-submit-btn').textContent = 'Update Product';

  const previews = document.getElementById('upload-previews');
  previews.innerHTML = (p.images||[]).map(url => `
    <div class="preview-item" data-existing-image="${url}">
      <img src="${url}" alt="">
      <button class="preview-remove" type="button" onclick="this.parentElement.remove()">✕</button>
    </div>`).join('');

  const videoPreviews = document.getElementById('video-previews');
  videoPreviews.innerHTML = (p.videos||[]).map(url => `
    <div class="preview-item" data-existing-video="${url}">
      <div style="background:var(--charcoal);border-radius:8px;display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;color:#fff;font-size:0.82rem">
        🎬 <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url.split('/').pop()}</span>
      </div>
      <button class="preview-remove" type="button" onclick="this.parentElement.remove()" style="top:4px;right:4px">✕</button>
    </div>`).join('');
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('form-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  try {
    // Collect existing images/videos still visible
    const existingImages = [...document.querySelectorAll('.preview-item[data-existing-image]')]
      .map(el => el.dataset.existingImage);
    const existingVideos = [...document.querySelectorAll('.preview-item[data-existing-video]')]
      .map(el => el.dataset.existingVideo);

    // Upload new images to Cloudinary
    const newImageUrls = [];
    for (const file of uploadedImageFiles) {
      btn.textContent = `Uploading image…`;
      const url = await uploadToCloudinary(file);
      newImageUrls.push(url);
    }

    // Upload new videos to Cloudinary
    const newVideoUrls = [];
    for (const file of uploadedVideoFiles) {
      btn.textContent = `Uploading video…`;
      const url = await uploadToCloudinary(file);
      newVideoUrls.push(url);
    }

    const productData = {
      name:        document.getElementById('p-name').value.trim(),
      category:    document.getElementById('p-category').value,
      price:       +document.getElementById('p-price').value,
      oldPrice:    +document.getElementById('p-old-price').value || null,
      description: document.getElementById('p-description').value.trim(),
      sizes:       document.getElementById('p-sizes').value.split(',').map(s => s.trim()).filter(Boolean),
      badge:       document.getElementById('p-badge').value || null,
      stock:       +document.getElementById('p-stock').value || 0,
      inStock:     document.getElementById('p-in-stock').checked,
      images:      [...existingImages, ...newImageUrls],
      videos:      [...existingVideos, ...newVideoUrls],
      updatedAt:   serverTimestamp(),
    };

    if (editingProductId) {
      await updateDoc(doc(db, 'products', editingProductId), productData);
      showAdminToast('Product updated! ✨', 'success');
    } else {
      productData.createdAt = serverTimestamp();
      await addDoc(collection(db, 'products'), productData);
      showAdminToast('Product saved! 🎉', 'success');
    }

    document.getElementById('product-form').reset();
    uploadedImageFiles = [];
    uploadedVideoFiles = [];
    editingProductId   = null;
    document.getElementById('upload-previews').innerHTML = '';
    document.getElementById('video-previews').innerHTML  = '';
    btn.textContent = 'Save Product';

  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    if (btn.textContent === 'Uploading…' || btn.textContent.startsWith('Uploading')) {
      btn.textContent = editingProductId ? 'Update Product' : 'Save Product';
    }
  }
}

// ─────────────────────────────────────────────
// LOOKBOOK VIDEOS SECTION
// ─────────────────────────────────────────────
async function loadVideos() {
  const list = document.getElementById('videos-list');
  if (!list) return;
  list.innerHTML = '<p style="padding:1rem;color:var(--muted)">Loading...</p>';
  try {
    const snap = await getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc')));
    const videos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!videos.length) {
      list.innerHTML = '<p style="padding:1rem;color:var(--muted)">No videos yet. Add one below.</p>';
      return;
    }
    list.innerHTML = videos.map(v => `
      <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--warm-white);border-radius:12px;margin-bottom:0.75rem">
        ${v.thumbnail
          ? `<img src="${v.thumbnail}" style="width:80px;height:50px;object-fit:cover;border-radius:8px">`
          : `<div style="width:80px;height:50px;background:var(--charcoal);border-radius:8px;display:grid;place-items:center;color:#fff;font-size:1.5rem">🎬</div>`
        }
        <div style="flex:1">
          <div style="font-weight:700">${v.title || 'Untitled'}</div>
          <div style="font-size:0.8rem;color:var(--muted)">${v.tag || ''} · ${v.description || ''}</div>
        </div>
        <button class="action-btn del" onclick="window.deleteVideo('${v.id}')">🗑️</button>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:red;padding:1rem">${err.message}</p>`;
  }
}

window.deleteVideo = async (id) => {
  if (!confirm('Delete this video?')) return;
  await deleteDoc(doc(db, 'videos', id));
  showAdminToast('Video deleted', 'warning');
  loadVideos();
};

document.getElementById('video-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter || document.querySelector('#video-form button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  const videoFile = document.getElementById('vf-file').files[0];
  const thumbFile = document.getElementById('vf-thumb').files[0];
  const title     = document.getElementById('vf-title').value.trim();
  const tag       = document.getElementById('vf-tag').value.trim();
  const desc      = document.getElementById('vf-desc').value.trim();

  try {
    let videoUrl = document.getElementById('vf-url').value.trim();
    let thumbUrl = '';

    if (videoFile) {
      videoUrl = await uploadToCloudinary(videoFile);
    }
    if (!videoUrl) { showAdminToast('Provide a video file or URL', 'error'); return; }
    if (thumbFile) {
      thumbUrl = await uploadToCloudinary(thumbFile);
    }

    await addDoc(collection(db, 'videos'), {
      url: videoUrl, thumbnail: thumbUrl, title, tag, description: desc,
      active: true, createdAt: serverTimestamp()
    });
    showAdminToast('Video added to lookbook!', 'success');
    document.getElementById('video-form').reset();
    loadVideos();
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Video';
  }
});

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────
async function loadCategories() {
  const list = document.getElementById('categories-list');
  if (!list) return;
  list.innerHTML = '<p style="padding:1rem;color:var(--muted)">Loading...</p>';
  try {
    const snap = await getDocs(collection(db, 'categories'));
    const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!cats.length) {
      list.innerHTML = '<p style="padding:1rem;color:var(--muted)">No categories yet. Add one below.</p>';
      return;
    }
    list.innerHTML = cats.map(c => `
      <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--warm-white);border-radius:12px;margin-bottom:0.75rem">
        ${c.image ? `<img src="${c.image}" style="width:60px;height:60px;object-fit:cover;border-radius:8px">` : '<div style="width:60px;height:60px;background:var(--petal);border-radius:8px;display:grid;place-items:center;font-size:1.5rem">📁</div>'}
        <div style="flex:1">
          <div style="font-weight:700">${c.name}</div>
          <div style="font-size:0.8rem;color:var(--muted)">${c.description||''}</div>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="action-btn edit" onclick="window.editCategory('${c.id}','${c.name.replace(/'/g,"\\'")}','${(c.description||'').replace(/'/g,"\\'")}')">✏️</button>
          <button class="action-btn del" onclick="window.deleteCategory('${c.id}')">🗑️</button>
        </div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:red;padding:1rem">${err.message}</p>`;
  }
}

document.getElementById('category-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const name      = document.getElementById('cat-name').value.trim();
  const desc      = document.getElementById('cat-desc').value.trim();
  const imageFile = document.getElementById('cat-image').files[0];
  if (!name) return;
  try {
    let imageUrl = '';
    if (imageFile) imageUrl = await uploadToCloudinary(imageFile);
    await addDoc(collection(db, 'categories'), { name, description: desc, image: imageUrl, createdAt: serverTimestamp() });
    showAdminToast('Category added!', 'success');
    document.getElementById('category-form').reset();
    loadCategories();
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
});

window.deleteCategory = async (id) => {
  if (!confirm('Delete this category?')) return;
  await deleteDoc(doc(db, 'categories', id));
  showAdminToast('Category deleted', 'warning');
  loadCategories();
};

window.editCategory = async (id, name, desc) => {
  document.getElementById('cat-name').value = name;
  document.getElementById('cat-desc').value = desc;
  if (document.getElementById('cat-form-title')) document.getElementById('cat-form-title').textContent = 'Edit Category';
  const form = document.getElementById('category-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'categories', id), {
        name: document.getElementById('cat-name').value.trim(),
        description: document.getElementById('cat-desc').value.trim(),
      });
      showAdminToast('Category updated!', 'success');
      loadCategories();
    } catch (err) {
      showAdminToast('Error: ' + err.message, 'error');
    }
  });
};

// ─────────────────────────────────────────────
// HERO SLIDES — Cloudinary image uploads
// ─────────────────────────────────────────────
async function loadHeroSlides() {
  const list = document.getElementById('hero-slides-list');
  if (!list) return;
  list.innerHTML = '<p style="padding:1rem;color:var(--muted)">Loading...</p>';
  try {
    const snap = await getDocs(query(collection(db, 'heroSlides'), orderBy('order', 'asc')));
    const slides = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!slides.length) {
      list.innerHTML = '<p style="padding:1rem;color:var(--muted)">No slides yet.</p>';
      return;
    }
    list.innerHTML = slides.map(s => `
      <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--warm-white);border-radius:12px;margin-bottom:0.75rem">
        <img src="${s.bg||''}" style="width:80px;height:50px;object-fit:cover;border-radius:8px;background:var(--petal)">
        <div style="flex:1">
          <div style="font-weight:700">${s.title?.replace(/<[^>]+>/g,'')||'—'}</div>
          <div style="font-size:0.8rem;color:var(--muted)">${s.tag||''} · ${s.cta1||''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <input type="checkbox" ${s.active!==false?'checked':''} onchange="window.toggleSlide('${s.id}',this.checked)">
          <button class="action-btn del" onclick="window.deleteSlide('${s.id}')">🗑️</button>
        </div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:red;padding:1rem">${err.message}</p>`;
  }
}

document.getElementById('hero-slide-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const bgFile = document.getElementById('slide-bg-file').files[0];
  const bgUrl  = document.getElementById('slide-bg-url').value.trim();
  const tag    = document.getElementById('slide-tag').value.trim();
  const title  = document.getElementById('slide-title').value.trim();
  const desc   = document.getElementById('slide-desc').value.trim();
  const cta1   = document.getElementById('slide-cta1').value.trim();
  const cta2   = document.getElementById('slide-cta2').value.trim();
  try {
    let bg = bgUrl;
    if (bgFile) bg = await uploadToCloudinary(bgFile);
    if (!bg) { showAdminToast('Provide a background image', 'error'); return; }
    const snap2 = await getDocs(collection(db, 'heroSlides'));
    await addDoc(collection(db, 'heroSlides'), { bg, tag, title, desc, cta1, cta2, order: snap2.size, active: true, createdAt: serverTimestamp() });
    showAdminToast('Slide added!', 'success');
    document.getElementById('hero-slide-form').reset();
    loadHeroSlides();
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
});

window.deleteSlide = async (id) => {
  if (!confirm('Delete this slide?')) return;
  await deleteDoc(doc(db, 'heroSlides', id));
  showAdminToast('Slide deleted', 'warning');
  loadHeroSlides();
};

window.toggleSlide = async (id, active) => {
  await updateDoc(doc(db, 'heroSlides', id), { active });
  showAdminToast(active ? 'Slide activated' : 'Slide hidden', 'info');
};

// ─────────────────────────────────────────────
// PROMOTIONS
// ─────────────────────────────────────────────
async function loadPromotions() {
  const list = document.getElementById('promos-list');
  if (!list) return;
  list.innerHTML = '<p style="padding:1rem;color:var(--muted)">Loading...</p>';
  try {
    const snap = await getDocs(query(collection(db, 'promotions'), orderBy('createdAt', 'desc')));
    const promos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!promos.length) { list.innerHTML = '<p style="padding:1rem;color:var(--muted)">No promotions yet.</p>'; return; }
    list.innerHTML = promos.map(p => `
      <div style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--warm-white);border-radius:12px;margin-bottom:0.75rem">
        <div style="font-size:1.5rem">${p.type==='discount'?'🏷️':'📢'}</div>
        <div style="flex:1">
          <div style="font-weight:700">${p.code||p.title}</div>
          <div style="font-size:0.8rem;color:var(--muted)">${p.type==='discount'?`${p.discount}% off`:'Banner'} · Expires: ${p.expiry||'—'}</div>
        </div>
        <div style="display:flex;gap:0.5rem">
          <span class="badge badge-${p.active?'active':'draft'}">${p.active?'Active':'Inactive'}</span>
          <button class="action-btn del" onclick="window.deletePromo('${p.id}')">🗑️</button>
        </div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p style="color:red;padding:1rem">${err.message}</p>`;
  }
}

document.getElementById('promo-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await addDoc(collection(db, 'promotions'), {
      title:    document.getElementById('promo-title').value.trim(),
      code:     document.getElementById('promo-code').value.trim().toUpperCase(),
      type:     document.getElementById('promo-type').value,
      discount: +document.getElementById('promo-discount').value || 0,
      expiry:   document.getElementById('promo-expiry').value,
      active: true, createdAt: serverTimestamp()
    });
    showAdminToast('Promotion created!', 'success');
    document.getElementById('promo-form').reset();
    loadPromotions();
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
});

window.deletePromo = async (id) => {
  if (!confirm('Delete this promotion?')) return;
  await deleteDoc(doc(db, 'promotions', id));
  showAdminToast('Promotion deleted', 'warning');
  loadPromotions();
};

// ─────────────────────────────────────────────
// STORE SETTINGS
// ─────────────────────────────────────────────
async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'store'));
    if (snap.exists()) {
      const s = snap.data();
      document.getElementById('store-name').value          = s.storeName || '';
      document.getElementById('store-email').value         = s.email || '';
      document.getElementById('store-phone').value         = s.phone || '';
      document.getElementById('store-address').value       = s.address || '';
      document.getElementById('store-currency').value      = s.currency || 'KSh';
      document.getElementById('store-delivery-fee').value  = s.deliveryFee || '';
      document.getElementById('store-free-delivery').value = s.freeDeliveryAbove || '';
      document.getElementById('store-marquee').value       = s.marqueeText || '';
    }
  } catch { /* no settings doc yet */ }
}

document.getElementById('settings-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    storeName:         document.getElementById('store-name').value.trim(),
    email:             document.getElementById('store-email').value.trim(),
    phone:             document.getElementById('store-phone').value.trim(),
    address:           document.getElementById('store-address').value.trim(),
    currency:          document.getElementById('store-currency').value.trim(),
    deliveryFee:       +document.getElementById('store-delivery-fee').value || 0,
    freeDeliveryAbove: +document.getElementById('store-free-delivery').value || 0,
    marqueeText:       document.getElementById('store-marquee').value.trim(),
    updatedAt:         serverTimestamp(),
  };
  try {
    const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    await setDoc(doc(db, 'settings', 'store'), data, { merge: true });
    showAdminToast('Settings saved!', 'success');
  } catch (err) {
    showAdminToast('Error: ' + err.message, 'error');
  }
});

// ─────────────────────────────────────────────
// MOBILE SIDEBAR
// ─────────────────────────────────────────────
function initSidebarToggle() {
  document.getElementById('sidebar-toggle')?.addEventListener('click', () =>
    document.querySelector('.sidebar')?.classList.toggle('open')
  );
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(s) {
  const map = { pending:'pending', pending_payment:'pending', confirmed:'active', shipped:'active', delivered:'active', cancelled:'sold' };
  return map[s] || 'draft';
}

function showModal(title, body) {
  let m = document.getElementById('admin-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'admin-modal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(44,34,48,0.6);z-index:9999;display:grid;place-items:center;padding:1rem';
    document.body.appendChild(m);
  }
  m.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:2rem;max-width:560px;width:100%;max-height:80vh;overflow-y:auto;position:relative">
      <button onclick="document.getElementById('admin-modal').remove()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.2rem;cursor:pointer">✕</button>
      <div style="font-family:'Playfair Display',serif;font-size:1.2rem;font-weight:800;margin-bottom:1.25rem">${title}</div>
      ${body}
    </div>`;
}

// Alias so inline onclick="window.viewOrder(...)" also works
window.viewOrder = window.viewOrderDetails;

window.triggerSection = (name) => {
  document.querySelectorAll('.sidebar-nav li a[data-section]').forEach(a => {
    if (a.dataset.section === name) a.click();
  });
};

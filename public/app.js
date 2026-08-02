/* ============================================================
 *  পারিবারিক হিসাব ও কাপড় ব্যবসা — ক্লায়েন্ট অ্যাপ
 * ============================================================ */
'use strict';

/* ---------------- গ্লোবাল স্টেট ---------------- */
const state = {
  me: null,
  members: [],
  route: 'dashboard',
  familyFilter: { type: 'all', month: '', memberId: 'all' },
  bizTab: 'stock',
  duesTab: 'receivable',
  report: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
  receipt: null
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- বাংলা সংখ্যা ও টাকা ফরম্যাট ---------------- */
const BN_D = { 0: '০', 1: '১', 2: '২', 3: '৩', 4: '৪', 5: '৫', 6: '৬', 7: '৭', 8: '৮', 9: '৯' };
const bn = (v) => String(v).replace(/\d/g, (d) => BN_D[d]);
const fmt = (n) => '৳' + bn(Number(n || 0).toLocaleString('en-IN'));
const fmtSigned = (n) => (n < 0 ? '−' : '') + fmt(Math.abs(n));
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, dd] = d.split('-').map(Number);
  return `${bn(dd)} ${BN_MONTHS[m - 1]} ${bn(y)}`;
}
const todayStr = () => {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/* ---------------- ভূমিকার নাম ---------------- */
const ROLE_LABEL = { member: 'সদস্য', earner: 'আয়দাতা', business: 'ব্যবসায়ী', admin: 'অ্যাডমিন' };
const canIncome = () => state.me && ['earner', 'admin'].includes(state.me.role);
const canBusiness = () => state.me && ['business', 'admin'].includes(state.me.role);
const isAdmin = () => state.me && state.me.role === 'admin';
const memberName = (id) => (state.members.find((m) => m.id === id) || {}).name || '—';

/* ---------------- API কল ---------------- */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* খালি উত্তর */ }
  if (!res.ok) throw new Error(data.error || 'সার্ভারে সমস্যা হয়েছে');
  return data;
}

/* ---------------- টোস্ট বার্তা ---------------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2800);
}

/* ---------------- মডাল ---------------- */
function openModal(title, bodyHtml, onSubmit, submitLabel) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>${title}</h3><button class="modal-x" type="button">✕</button></div>
        <form class="modal-form" novalidate>
          <div class="modal-body">${bodyHtml}</div>
          <div class="modal-foot">
            <button type="button" class="btn btn-soft modal-cancel">বাতিল</button>
            <button type="submit" class="btn btn-primary">${submitLabel || 'সংরক্ষণ করুন'}</button>
          </div>
          <p class="error-text form-error" hidden></p>
        </form>
      </div>
    </div>`;
  root.hidden = false;
  const close = () => { root.hidden = true; root.innerHTML = ''; };
  root.querySelector('.modal-x').onclick = close;
  root.querySelector('.modal-cancel').onclick = close;
  root.querySelector('.modal-overlay').addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) close(); });
  const form = root.querySelector('.modal-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const errEl = form.querySelector('.form-error');
    errEl.hidden = true;
    const fd = Object.fromEntries(new FormData(form).entries());
    try { await onSubmit(fd, close, form); }
    catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
  };
  const first = form.querySelector('input, select, textarea');
  if (first) first.focus();
  return close;
}
const field = (label, inner) => `<label class="f-field"><span>${label}</span>${inner}</label>`;
const numInput = (name, label, opts = {}) =>
  field(label, `<input type="number" name="${name}" min="${opts.min ?? 0}" step="any" value="${opts.value ?? ''}" placeholder="${opts.placeholder ?? ''}" ${opts.required === false ? '' : 'required'} />`);
const dateInput = (name, label, value) =>
  field(label, `<input type="date" name="${name}" value="${value || todayStr()}" required />`);
const textInput = (name, label, opts = {}) =>
  field(label, `<input type="text" name="${name}" value="${esc(opts.value ?? '')}" placeholder="${opts.placeholder ?? ''}" ${opts.required ? 'required' : ''} />`);
const selectInput = (name, label, options, selected) =>
  field(label, `<select name="${name}">${options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(selected) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`);
/* ---------------- নেভিগেশন ও রাউটার ---------------- */
const ROUTES = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড',  ico: '🏠' },
  { id: 'family',    label: 'আয়-ব্যয়',   ico: '💰' },
  { id: 'business',  label: 'কাপড় ব্যবসা', ico: '🏪' },
  { id: 'dues',      label: 'বাকি/দেনা',   ico: '📒' },
  { id: 'receipt',   label: 'রসিদ',        ico: '🧾' },
  { id: 'reports',   label: 'রিপোর্ট',     ico: '📊' }
];
function renderNavs() {
  const html = ROUTES.map((r) =>
    `<button class="nav-btn ${state.route === r.id ? 'active' : ''}" data-route="${r.id}"><span class="ico">${r.ico}</span><span>${r.label}</span></button>`).join('');
  $('#topnav').innerHTML = html;
  $('#bottomnav').innerHTML = html;
  document.querySelectorAll('.nav-btn').forEach((b) => (b.onclick = () => { location.hash = '#/' + b.dataset.route; }));
}
function router() {
  const r = (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
  state.route = ROUTES.some((x) => x.id === r) ? r : 'dashboard';
  renderNavs();
  renderRoute();
}
async function renderRoute() {
  const views = { dashboard: viewDashboard, family: viewFamily, business: viewBusiness, dues: viewDues, receipt: viewReceipt, reports: viewReports };
  try { await views[state.route](); }
  catch (e) { $('#view').innerHTML = `<div class="card"><p class="error-text">${esc(e.message)}</p></div>`; }
}
const softReload = () => { if (state.me && !$('#app').hidden) renderRoute(); };

/* ---------------- লগইন ---------------- */
let selectedMember = null;
async function showLogin() {
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  const grid = $('#member-grid');
  grid.innerHTML = '<p class="muted">লোড হচ্ছে…</p>';
  try {
    const members = await api('/members-public');
    grid.innerHTML = members.map((m) =>
      `<button type="button" class="member-card" data-id="${m.id}">${esc(m.name)}<small>${ROLE_LABEL[m.role] || ''}</small></button>`).join('');
    grid.querySelectorAll('.member-card').forEach((b) => (b.onclick = () => {
      selectedMember = Number(b.dataset.id);
      grid.querySelectorAll('.member-card').forEach((x) => x.classList.toggle('sel', x === b));
      $('#login-pin').focus();
    }));
  } catch (e) { grid.innerHTML = `<p class="error-text">${esc(e.message)}</p>`; }
}
async function doLogin(e) {
  e.preventDefault();
  const errEl = $('#login-error');
  errEl.hidden = true;
  if (!selectedMember) { errEl.textContent = 'আগে উপরে থেকে আপনার নাম বেছে নিন'; errEl.hidden = false; return; }
  try {
    const { me } = await api('/login', { method: 'POST', body: { memberId: selectedMember, pin: $('#login-pin').value.trim() } });
    $('#login-pin').value = '';
    await boot(me);
    toast(`স্বাগতম, ${me.name}! 👋`);
  } catch (err) { errEl.textContent = err.message; errEl.hidden = false; }
}
async function boot(me) {
  state.me = me;
  state.members = await api('/members');
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  $('#user-chip').innerHTML = `👤 ${esc(me.name)} <small>${ROLE_LABEL[me.role]}</small>`;
  if (!location.hash) location.hash = '#/dashboard';
  router();
}
async function init() {
  $('#login-form').addEventListener('submit', doLogin);
  $('#logout-btn').onclick = async () => {
    try { await api('/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    state.me = null;
    showLogin();
  };
  $('#settings-btn').onclick = openSettings;
  window.addEventListener('hashchange', router);
  try { const { me } = await api('/me'); await boot(me); }
  catch (e) { showLogin(); }
}

/* ---------------- রিয়েল-টাইম (Socket.IO) ---------------- */
(function initSocket() {
  const socket = io();
  socket.on('connect', () => { const s = $('#sync-status'); if (s) { s.textContent = '● সংযুক্ত'; s.className = 'sync-ok'; } });
  socket.on('disconnect', () => { const s = $('#sync-status'); if (s) { s.textContent = '● সংযোগ বিচ্ছিন্ন'; s.className = 'sync-off'; } });
  socket.on('sync', () => softReload());
})();

document.addEventListener('DOMContentLoaded', init);
/* ---------------- ড্যাশবোর্ড ---------------- */
async function viewDashboard() {
  const s = await api('/summary');
  const f = s.family, b = s.business, d = s.dues;
  $('#view').innerHTML = `
  <div class="page-head"><h2>আসসালামু আলাইকুম, ${esc(state.me.name)}! 👋</h2><span class="muted">${fmtDate(todayStr())}</span></div>
  <div class="hero card">
    <small>পরিবারের বর্তমান ব্যালেন্স (মোট আয় − মোট খরচ)</small>
    <div class="hero-balance ${f.balance < 0 ? 'neg' : ''}">${fmtSigned(f.balance)}</div>
    <div class="hero-sub"><span>মোট আয়: <b class="pos">${fmt(f.totalIncome)}</b></span><span>মোট খরচ: <b class="neg">${fmt(f.totalExpense)}</b></span></div>
  </div>
  <div class="stat-grid cols-4">
    <div class="stat tint-green"><small>এই মাসের আয়</small><b>${fmt(f.monthIncome)}</b></div>
    <div class="stat tint-red"><small>এই মাসের খরচ</small><b>${fmt(f.monthExpense)}</b></div>
    <div class="stat tint-teal"><small>ব্যবসায় মোট বিক্রি</small><b>${fmt(b.totalSales)}</b></div>
    <div class="stat tint-gold"><small>ব্যবসায় মোট লাভ</small><b>${fmt(b.grossProfit)}</b></div>
  </div>
  <div class="stat-grid cols-4" style="margin-top:10px">
    <div class="stat"><small>আজকের বিক্রি</small><b>${fmt(b.today.sales)}</b><span class="sub">লাভ: ${fmt(b.today.profit)}</span></div>
    <div class="stat"><small>এই মাসের বিক্রি</small><b>${fmt(b.month.sales)}</b><span class="sub">লাভ: ${fmt(b.month.profit)}</span></div>
    <div class="stat tint-teal"><small>স্টকে পণ্য</small><b>${bn(b.stockQty)} পিস</b><span class="sub">মূল্য: ${fmt(b.stockValue)}</span></div>
    <div class="stat tint-red"><small>বাকি/দেনা</small><b style="font-size:16.5px">পাওনা ${fmt(d.receivableUnpaid)}</b><span class="sub">দেনা: ${fmt(d.payableUnpaid)}</span></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>🕒 সাম্প্রতিক লেনদেন</h3>${recentList(s.recent)}</div>`;
}
const txIcon = (kind) => (kind === 'income' ? '💵' : kind === 'expense' ? '🛒' : '🏪');
function recentList(items) {
  if (!items.length) return '<p class="muted">এখনও কোনো লেনদেন নেই</p>';
  return `<ul class="tx-list">${items.map((x) => {
    const sub = x.kind === 'sale'
      ? `${memberName(x.memberId)} · ${fmtDate(x.date)} · ${bn(x.qty || 0)} পিস বিক্রি`
      : `${memberName(x.memberId)} · ${fmtDate(x.date)}${x.note ? ' · ' + esc(x.note) : ''}`;
    return `<li class="tx-item">
      <span class="tx-ico">${txIcon(x.kind)}</span>
      <span class="tx-main"><b>${esc(x.category)}</b><small>${sub}</small></span>
      <span class="tx-amt ${x.kind === 'expense' ? 'neg' : 'pos'}">${x.kind === 'expense' ? '−' : '+'} ${fmt(x.amount)}</span>
    </li>`;
  }).join('')}</ul>`;
}
/* ---------------- আয়-ব্যয় ---------------- */
async function viewFamily() {
  const q = new URLSearchParams();
  if (state.familyFilter.type !== 'all') q.set('type', state.familyFilter.type);
  if (state.familyFilter.month) { const [y, m] = state.familyFilter.month.split('-'); q.set('year', y); q.set('month', Number(m)); }
  if (state.familyFilter.memberId !== 'all') q.set('memberId', state.familyFilter.memberId);
  const [txs, cats] = await Promise.all([api('/transactions?' + q), api('/categories')]);
  state.cats = cats;
  const income = txs.filter((x) => x.type === 'income').reduce((a, x) => a + x.amount, 0);
  const expense = txs.filter((x) => x.type === 'expense').reduce((a, x) => a + x.amount, 0);
  $('#view').innerHTML = `
  <div class="page-head">
    <h2>💰 পারিবারিক আয়-ব্যয়</h2>
    <div class="actions">
      ${canIncome() ? '<button class="btn btn-primary" id="add-income">＋ আয় যোগ করুন</button>' : ''}
      <button class="btn btn-gold" id="add-expense">＋ খরচ যোগ করুন</button>
    </div>
  </div>
  <div class="card filters">
    <select id="ff-type"><option value="all">সব ধরন</option><option value="income">শুধু আয়</option><option value="expense">শুধু খরচ</option></select>
    <input type="month" id="ff-month" value="${state.familyFilter.month}" />
    <select id="ff-member"><option value="all">সব সদস্য</option>${state.members.filter((m) => m.role !== 'admin').map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
  </div>
  <div class="stat-grid">
    <div class="stat tint-green"><small>মোট আয়</small><b>${fmt(income)}</b></div>
    <div class="stat tint-red"><small>মোট খরচ</small><b>${fmt(expense)}</b></div>
    <div class="stat tint-teal"><small>ব্যালেন্স</small><b>${fmtSigned(income - expense)}</b></div>
  </div>
  <div class="card" style="margin-top:12px"><h3>লেনদেনের তালিকা (${bn(txs.length)}টি)</h3>${familyTable(txs)}</div>`;
  $('#ff-type').value = state.familyFilter.type;
  $('#ff-member').value = state.familyFilter.memberId;
  $('#ff-type').onchange = (e) => { state.familyFilter.type = e.target.value; renderRoute(); };
  $('#ff-month').onchange = (e) => { state.familyFilter.month = e.target.value; renderRoute(); };
  $('#ff-member').onchange = (e) => { state.familyFilter.memberId = e.target.value; renderRoute(); };
  const ai = $('#add-income'); if (ai) ai.onclick = () => openTxForm('income');
  $('#add-expense').onclick = () => openTxForm('expense');
  bindTxDelete();
}
function familyTable(txs) {
  if (!txs.length) return '<p class="muted">কোনো লেনদেন পাওয়া যায়নি</p>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>তারিখ</th><th>ধরন</th><th>বিবরণ</th><th>সদস্য</th><th class="r">পরিমাণ</th><th></th></tr></thead><tbody>
  ${txs.map((x) => `<tr>
    <td style="white-space:nowrap">${fmtDate(x.date)}</td>
    <td><span class="badge ${x.type}">${x.type === 'income' ? 'আয়' : 'খরচ'}</span></td>
    <td>${esc(x.category)}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</td>
    <td>${memberName(x.memberId)}</td>
    <td class="r ${x.type === 'income' ? 'pos' : 'neg'}"><b>${fmt(x.amount)}</b></td>
    <td class="r">${(isAdmin() || x.createdBy === state.me.id) ? `<button class="btn btn-danger btn-sm del-tx" data-id="${x.id}">মুছুন</button>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`;
}
function bindTxDelete() {
  document.querySelectorAll('.del-tx').forEach((b) => (b.onclick = async () => {
    if (!confirm('আপনি কি সত্যিই এই লেনদেনটি মুছে ফেলতে চান?')) return;
    try { await api('/transactions/' + b.dataset.id, { method: 'DELETE' }); toast('লেনদেন মুছে ফেলা হয়েছে ✓'); renderRoute(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}
function openTxForm(type) {
  const isInc = type === 'income';
  const cats = (state.cats && state.cats[type]) || [];
  const memberSel = isAdmin()
    ? selectInput('memberId', 'কার নামে', state.members.filter((m) => m.role !== 'admin').map((m) => ({ value: m.id, label: m.name })), isInc ? 3 : state.me.id)
    : '';
  openModal(isInc ? '＋ আয় যোগ করুন' : '＋ খরচ যোগ করুন', `
    ${memberSel}
    ${selectInput('category', 'খাত', cats.map((c) => ({ value: c, label: c })))}
    ${numInput('amount', 'পরিমাণ (৳)', { placeholder: 'যেমন: ৫০০' })}
    ${dateInput('date', 'তারিখ')}
    ${textInput('note', 'নোট (ঐচ্ছিক)')}
  `, async (fd, close) => {
    await api('/transactions', { method: 'POST', body: { type, category: fd.category, amount: fd.amount, date: fd.date, note: fd.note, memberId: fd.memberId } });
    close();
    toast(isInc ? 'আয় সংরক্ষণ হয়েছে ✓' : 'খরচ সংরক্ষণ হয়েছে ✓');
    renderRoute();
  });
}
/* ---------------- কাপড় ব্যবসা ---------------- */
async function viewBusiness() {
  const s = await api('/summary');
  const b = s.business;
  const tabs = [
    { id: 'stock', label: '📦 স্টক' },
    { id: 'sales', label: '🧾 বিক্রি' },
    { id: 'purchases', label: '🛍️ ক্রয়' }
  ];
  $('#view').innerHTML = `
  <div class="page-head"><h2>🏪 সাখাওয়াতের কাপড় ব্যবসা</h2>
    <div class="actions">${canBusiness() ? `
      <button class="btn btn-primary" id="add-product">＋ নতুন কাপড়</button>
      <button class="btn btn-gold" id="add-sale">＋ বিক্রি</button>
      <button class="btn btn-outline" id="add-purchase">＋ ক্রয়</button>` : ''}</div>
  </div>
  <div class="stat-grid cols-4">
    <div class="stat tint-teal"><small>মোট বিক্রি</small><b>${fmt(b.totalSales)}</b></div>
    <div class="stat tint-gold"><small>মোট লাভ</small><b>${fmt(b.grossProfit)}</b></div>
    <div class="stat"><small>আজকের বিক্রি</small><b>${fmt(b.today.sales)}</b><span class="sub">লাভ: ${fmt(b.today.profit)}</span></div>
    <div class="stat tint-green"><small>স্টক মূল্য</small><b>${fmt(b.stockValue)}</b><span class="sub">${bn(b.stockQty)} পিস · ${bn(b.stockItems)} ধরন</span></div>
  </div>
  <div class="tabbar">${tabs.map((t) => `<button class="tab ${state.bizTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
  <div id="biz-body" class="card"></div>`;
  document.querySelectorAll('#view .tab').forEach((t) => (t.onclick = () => { state.bizTab = t.dataset.tab; renderRoute(); }));
  if (canBusiness()) {
    $('#add-product').onclick = () => openProductForm();
    $('#add-sale').onclick = () => openSaleForm();
    $('#add-purchase').onclick = () => openPurchaseForm();
  }
  if (state.bizTab === 'stock') renderStockTab();
  else if (state.bizTab === 'sales') renderSalesTab();
  else renderPurchasesTab();
}
async function renderStockTab() {
  const products = await api('/products');
  state.products = products;
  const body = $('#biz-body');
  if (!products.length) { body.innerHTML = '<p class="muted">এখনও কোনো কাপড় যোগ করা হয়নি</p>'; return; }
  body.innerHTML = `<h3>বর্তমান স্টক</h3><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>কাপড়ের নাম</th><th class="r">স্টক</th><th class="r">ক্রয়মূল্য</th><th class="r">বিক্রয়মূল্য</th><th class="r">লাভ/পিস</th>${canBusiness() ? '<th></th>' : ''}</tr></thead><tbody>
    ${products.map((p) => `<tr>
      <td><b>${esc(p.name)}</b>${p.quantity < 5 ? ' <span class="badge low">স্টক কম</span>' : ''}</td>
      <td class="r">${bn(p.quantity)} পিস</td>
      <td class="r">${fmt(p.purchasePrice)}</td>
      <td class="r">${fmt(p.sellingPrice)}</td>
      <td class="r pos"><b>${fmt(p.sellingPrice - p.purchasePrice)}</b></td>
      ${canBusiness() ? `<td class="r" style="white-space:nowrap">
        <button class="btn btn-soft btn-sm edit-p" data-id="${p.id}">সম্পাদনা</button>
        <button class="btn btn-danger btn-sm del-p" data-id="${p.id}">মুছুন</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
  body.querySelectorAll('.edit-p').forEach((b) => (b.onclick = () => {
    openProductForm(products.find((x) => x.id === Number(b.dataset.id)));
  }));
  body.querySelectorAll('.del-p').forEach((b) => (b.onclick = async () => {
    if (!confirm('আপনি কি সত্যিই এই কাপড়টি মুছে ফেলতে চান?')) return;
    try { await api('/products/' + b.dataset.id, { method: 'DELETE' }); toast('কাপড় মুছে ফেলা হয়েছে ✓'); renderRoute(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}
async function renderSalesTab() {
  const sales = await api('/sales');
  const body = $('#biz-body');
  if (!sales.length) { body.innerHTML = '<p class="muted">এখনও কোনো বিক্রি হয়নি</p>'; return; }
  body.innerHTML = `<h3>বিক্রির তালিকা (${bn(sales.length)}টি)</h3><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>তারিখ</th><th>কাপড়</th><th class="r">পরিমাণ</th><th class="r">দাম</th><th class="r">মোট</th><th class="r">লাভ</th>${canBusiness() ? '<th></th>' : ''}</tr></thead><tbody>
    ${sales.map((x) => `<tr>
      <td style="white-space:nowrap">${fmtDate(x.date)}</td>
      <td>${esc(x.productName)}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</td>
      <td class="r">${bn(x.qty)}</td>
      <td class="r">${fmt(x.unitPrice)}</td>
      <td class="r"><b>${fmt(x.total)}</b></td>
      <td class="r pos"><b>${fmt(x.profit)}</b></td>
      ${canBusiness() ? `<td class="r"><button class="btn btn-danger btn-sm del-s" data-id="${x.id}">মুছুন</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
  body.querySelectorAll('.del-s').forEach((b) => (b.onclick = async () => {
    if (!confirm('এই বিক্রিটি মুছলে স্টক ফিরে যাবে। মুছে ফেলবেন?')) return;
    try { await api('/sales/' + b.dataset.id, { method: 'DELETE' }); toast('বিক্রি মুছে ফেলা হয়েছে ✓'); renderRoute(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}
async function renderPurchasesTab() {
  const purchases = await api('/purchases');
  const body = $('#biz-body');
  if (!purchases.length) { body.innerHTML = '<p class="muted">এখনও কোনো ক্রয় হয়নি</p>'; return; }
  body.innerHTML = `<h3>ক্রয়ের তালিকা (${bn(purchases.length)}টি)</h3><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>তারিখ</th><th>কাপড়</th><th>দোকান</th><th class="r">পরিমাণ</th><th class="r">দাম</th><th class="r">মোট</th>${canBusiness() ? '<th></th>' : ''}</tr></thead><tbody>
    ${purchases.map((x) => `<tr>
      <td style="white-space:nowrap">${fmtDate(x.date)}</td>
      <td>${esc(x.productName)}</td>
      <td>${esc(x.storeName || '—')}</td>
      <td class="r">${bn(x.qty)}</td>
      <td class="r">${fmt(x.unitPrice)}</td>
      <td class="r"><b>${fmt(x.total)}</b></td>
      ${canBusiness() ? `<td class="r"><button class="btn btn-danger btn-sm del-b" data-id="${x.id}">মুছুন</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
  body.querySelectorAll('.del-b').forEach((b) => (b.onclick = async () => {
    if (!confirm('এই ক্রয়টি মুছলে স্টক কমে যাবে। মুছে ফেলবেন?')) return;
    try { await api('/purchases/' + b.dataset.id, { method: 'DELETE' }); toast('ক্রয় মুছে ফেলা হয়েছে ✓'); renderRoute(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}

/* ---------------- ব্যবসার ফরম ---------------- */
function openProductForm(p) {
  const edit = !!p;
  openModal(edit ? 'কাপড় সম্পাদনা' : '＋ নতুন কাপড় যোগ করুন', `
    ${textInput('name', 'কাপড়ের নাম', { value: p && p.name, required: true, placeholder: 'যেমন: জামদানি শাড়ি' })}
    ${numInput('quantity', 'পরিমাণ / স্টক (পিস)', { value: edit ? p.quantity : '', placeholder: 'যেমন: ১০' })}
    ${numInput('purchasePrice', 'ক্রয়মূল্য (৳)', { value: edit ? p.purchasePrice : '', placeholder: 'যেমন: ৮০০' })}
    ${numInput('sellingPrice', 'বিক্রয়মূল্য (৳)', { value: edit ? p.sellingPrice : '', placeholder: 'যেমন: ১২০০' })}
  `, async (fd, close) => {
    const payload = { name: fd.name, quantity: fd.quantity, purchasePrice: fd.purchasePrice, sellingPrice: fd.sellingPrice };
    if (edit) await api('/products/' + p.id, { method: 'PUT', body: payload });
    else await api('/products', { method: 'POST', body: payload });
    close();
    toast(edit ? 'কাপড় হালনাগাদ হয়েছে ✓' : 'নতুন কাপড় যোগ হয়েছে ✓');
    renderRoute();
  });
}
async function ensureProducts() {
  if (!state.products || !state.products.length) state.products = await api('/products');
  return state.products;
}
async function openSaleForm() {
  const products = await ensureProducts();
  if (!products.length) { toast('আগে স্টকে কাপড় যোগ করুন', 'err'); return; }
  openModal('＋ নতুন বিক্রি', `
    ${selectInput('productId', 'কাপড়', products.map((p) => ({ value: p.id, label: `${p.name} (স্টক: ${p.quantity})` })))}
    ${numInput('qty', 'পরিমাণ (পিস)', { min: 1, placeholder: 'যেমন: ২' })}
    ${numInput('unitPrice', 'বিক্রয়মূল্য প্রতি পিস (৳) — খালি রাখলে নির্ধারিত দাম', { required: false, placeholder: 'ঐচ্ছিক' })}
    ${dateInput('date', 'তারিখ')}
    ${textInput('note', 'নোট (ঐচ্ছিক)')}
  `, async (fd, close) => {
    await api('/sales', { method: 'POST', body: fd });
    state.products = null;
    close();
    toast('বিক্রি সংরক্ষণ হয়েছে, স্টক কমে গেছে ✓');
    renderRoute();
  });
}
async function openPurchaseForm() {
  const products = await ensureProducts();
  if (!products.length) { toast('আগে স্টকে কাপড় যোগ করুন', 'err'); return; }
  openModal('＋ নতুন ক্রয়', `
    ${selectInput('productId', 'কাপড়', products.map((p) => ({ value: p.id, label: `${p.name} (স্টক: ${p.quantity})` })))}
    ${numInput('qty', 'পরিমাণ (পিস)', { min: 1, placeholder: 'যেমন: ১০' })}
    ${numInput('unitPrice', 'ক্রয়মূল্য প্রতি পিস (৳) — খালি রাখলে আগের দাম', { required: false, placeholder: 'ঐচ্ছিক' })}
    ${textInput('storeName', 'কোন দোকান থেকে কেনা (ঐচ্ছিক)', { placeholder: 'যেমন: আরিফ টেক্সটাইল' })}
    ${dateInput('date', 'তারিখ')}
    ${textInput('note', 'নোট (ঐচ্ছিক)')}
  `, async (fd, close) => {
    await api('/purchases', { method: 'POST', body: fd });
    state.products = null;
    close();
    toast('ক্রয় সংরক্ষণ হয়েছে, স্টক বেড়ে গেছে ✓');
    renderRoute();
  });
}
/* ---------------- বাকি/দেনা ---------------- */
async function viewDues() {
  const [dues, s] = await Promise.all([api('/dues'), api('/summary')]);
  const tabs = [
    { id: 'receivable', label: '📥 পাওনা (আমরা পাব)' },
    { id: 'payable', label: '📤 দেনা (আমরা দেব)' }
  ];
  const list = dues.filter((x) => x.type === state.duesTab);
  const unpaidSum = list.filter((x) => x.status === 'unpaid').reduce((a, x) => a + x.amount, 0);
  $('#view').innerHTML = `
  <div class="page-head"><h2>📒 বাকি / দেনার হিসাব</h2>
    <div class="actions">${canBusiness() ? '<button class="btn btn-primary" id="add-due">＋ নতুন হিসাব</button>' : ''}</div>
  </div>
  <div class="stat-grid">
    <div class="stat tint-green"><small>মোট পাওনা (বাকি)</small><b>${fmt(s.dues.receivableUnpaid)}</b></div>
    <div class="stat tint-red"><small>মোট দেনা (বাকি)</small><b>${fmt(s.dues.payableUnpaid)}</b></div>
    <div class="stat tint-teal"><small>এই তালিকায় বাকি</small><b>${fmt(unpaidSum)}</b></div>
  </div>
  <div class="tabbar">${tabs.map((t) => `<button class="tab ${state.duesTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
  <div class="due-grid">${list.length ? list.map(dueCard).join('') : '<p class="muted">কোনো হিসাব নেই</p>'}</div>`;
  document.querySelectorAll('#view .tab').forEach((t) => (t.onclick = () => { state.duesTab = t.dataset.tab; renderRoute(); }));
  const ad = $('#add-due'); if (ad) ad.onclick = openDueForm;
  document.querySelectorAll('.due-toggle').forEach((b) => (b.onclick = async () => {
    const to = b.dataset.to;
    try {
      await api('/dues/' + b.dataset.id, { method: 'PUT', body: { status: to } });
      toast(to === 'paid' ? 'পরিশোধিত হিসেবে চিহ্নিত ✓' : 'আবার বাকি করা হলো');
      renderRoute();
    } catch (e) { toast(e.message, 'err'); }
  }));
  document.querySelectorAll('.due-del').forEach((b) => (b.onclick = async () => {
    if (!confirm('আপনি কি সত্যিই এই হিসাবটি মুছে ফেলতে চান?')) return;
    try { await api('/dues/' + b.dataset.id, { method: 'DELETE' }); toast('হিসাব মুছে ফেলা হয়েছে ✓'); renderRoute(); }
    catch (e) { toast(e.message, 'err'); }
  }));
}
function dueCard(x) {
  const paid = x.status === 'paid';
  return `<div class="due-card ${paid ? 'paid' : ''}">
    <div class="top"><h4>${esc(x.storeName)}</h4><span class="amt">${fmt(x.amount)}</span></div>
    <div class="meta">তারিখ: ${fmtDate(x.date)} · <span class="badge ${paid ? 'paid' : 'unpaid'}">${paid ? 'পরিশোধিত' : 'বাকি'}</span>${paid && x.paidDate ? ` · পরিশোধ: ${fmtDate(x.paidDate)}` : ''}${x.note ? `<br>📝 ${esc(x.note)}` : ''}</div>
    ${canBusiness() ? `<div class="row">
      <button class="btn ${paid ? 'btn-soft' : 'btn-primary'} btn-sm due-toggle" data-id="${x.id}" data-to="${paid ? 'unpaid' : 'paid'}">${paid ? '↩ আবার বাকি' : '✓ পরিশোধিত'}</button>
      <button class="btn btn-danger btn-sm due-del" data-id="${x.id}">মুছুন</button>
    </div>` : ''}
  </div>`;
}
function openDueForm() {
  openModal('＋ নতুন বাকি/দেনার হিসাব', `
    ${selectInput('type', 'ধরন', [
      { value: 'receivable', label: '📥 পাওনা — অন্য দোকান আমাদের টাকা দেবে' },
      { value: 'payable', label: '📤 দেনা — আমরা অন্য দোকানে টাকা দেব' }
    ], state.duesTab)}
    ${textInput('storeName', 'দোকানের নাম', { required: true, placeholder: 'যেমন: নিউ মার্কেট ক্লথ স্টোর' })}
    ${numInput('amount', 'পরিমাণ (৳)', { placeholder: 'যেমন: ৫০০০' })}
    ${dateInput('date', 'তারিখ')}
    ${textInput('note', 'নোট (ঐচ্ছিক)')}
  `, async (fd, close) => {
    await api('/dues', { method: 'POST', body: fd });
    close();
    toast('হিসাব সংরক্ষণ হয়েছে ✓');
    renderRoute();
  });
}
/* ---------------- রসিদ ---------------- */
async function viewReceipt() {
  const members = state.members.filter((m) => m.role !== 'admin');
  const selId = isAdmin() ? (state.receiptMember || members[0].id) : state.me.id;
  $('#view').innerHTML = `
  <div class="page-head"><h2>🧾 ব্যক্তিগত রসিদ</h2></div>
  <div class="card">
    <div class="filters" style="align-items:flex-end">
      ${isAdmin() ? `<label class="f-field" style="flex:1;min-width:140px"><span>সদস্য</span><select id="rc-member">${members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>` : `<p style="flex:1"><b>${esc(state.me.name)}</b> — আপনার নিজের রসিদ</p>`}
      <label class="f-field"><span>শুরুর তারিখ</span><input type="date" id="rc-from" /></label>
      <label class="f-field"><span>শেষের তারিখ</span><input type="date" id="rc-to" /></label>
      <button class="btn btn-primary" id="rc-gen">রসিদ তৈরি করুন</button>
    </div>
    <p class="hint">তারিখ খালি রাখলে সব সময়ের হিসাব দেখাবে।</p>
  </div>
  <div id="rc-out"></div>`;
  const sel = $('#rc-member');
  if (sel) { sel.value = selId; sel.onchange = () => { state.receiptMember = Number(sel.value); state.receipt = null; $('#rc-out').innerHTML = ''; }; }
  $('#rc-gen').onclick = async () => {
    const id = isAdmin() ? Number(sel.value) : state.me.id;
    const from = $('#rc-from').value, to = $('#rc-to').value;
    try {
      const r = await api(`/receipt/${id}?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}`);
      state.receipt = r;
      renderReceipt(r);
      toast('রসিদ তৈরি হয়েছে ✓');
    } catch (e) { toast(e.message, 'err'); }
  };
  if (state.receipt && state.receipt.member.id === selId) renderReceipt(state.receipt);
}
function renderReceipt(r) {
  const period = (r.from || r.to)
    ? `${r.from ? fmtDate(r.from) : 'শুরু থেকে'} — ${r.to ? fmtDate(r.to) : 'আজ পর্যন্ত'}`
    : 'সব সময়';
  $('#rc-out').innerHTML = `
  <div class="receipt" id="receipt-doc">
    <div class="receipt-head">
      <h2>🧾 পারিবারিক হিসাব</h2>
      <div>ব্যক্তিগত রসিদ</div>
      <div class="r-no">রসিদ নং: ${esc(r.rid)}</div>
    </div>
    <div class="receipt-meta">
      <span>সদস্য: <b>${esc(r.member.name)}</b></span>
      <span>সময়কাল: <b>${period}</b></span>
    </div>
    <div class="receipt-sums">
      <div class="rs g">মোট জমা দিয়েছেন<b>${fmt(r.given)}</b></div>
      <div class="rs r">মোট খরচ করেছেন<b>${fmt(r.spent)}</b></div>
      <div class="rs t">নিট ব্যালেন্স<b>${fmtSigned(r.net)}</b></div>
    </div>
    ${r.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>তারিখ</th><th>বিবরণ</th><th class="r">জমা (৳)</th><th class="r">খরচ (৳)</th></tr></thead><tbody>
      ${r.items.map((x) => `<tr><td style="white-space:nowrap">${fmtDate(x.date)}</td><td>${esc(x.category)}${x.note ? ` <small class="muted">(${esc(x.note)})</small>` : ''}</td><td class="r pos">${x.type === 'income' ? fmt(x.amount) : '—'}</td><td class="r neg">${x.type === 'expense' ? fmt(x.amount) : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted" style="text-align:center">এই সময়ে কোনো লেনদেন নেই</p>'}
    <div class="receipt-foot">
      রসিদ তৈরি করেছেন: ${esc(r.generatedBy)} · ${fmtDate(todayStr())}<br />
      ধন্যবাদ! এটি কম্পিউটার তৈরি রসিদ।
    </div>
  </div>
  <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
    <button class="btn btn-primary" id="rc-print">🖨️ প্রিন্ট করুন</button>
    <button class="btn btn-outline" id="rc-dl">⬇️ ডাউনলোড</button>
  </div>`;
  $('#rc-print').onclick = () => { $('#print-area').innerHTML = $('#receipt-doc').outerHTML; window.print(); };
  $('#rc-dl').onclick = () => downloadReceipt(r);
}
function downloadReceipt(r) {
  const css = `body{font-family:'Hind Siliguri',sans-serif;padding:24px;background:#f4f7f6;color:#1f2937}
.receipt{max-width:640px;margin:0 auto;background:#fff;border:2px dashed #0f766e;border-radius:16px;padding:22px}
.receipt-head{text-align:center;border-bottom:2px dashed #e5e7eb;padding-bottom:12px;margin-bottom:12px}
.receipt-head h2{color:#0b5c56;font-size:21px;margin:0}.r-no{font-size:12.5px;color:#6b7280}
.receipt-meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:14.5px;margin-bottom:10px}
.receipt-sums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.receipt-sums .rs{text-align:center;border-radius:10px;padding:10px 6px;font-size:13px}
.receipt-sums .rs b{display:block;font-size:17px;margin-top:2px}
.rs.g{background:#dcfce7;color:#15803d}.rs.r{background:#fee2e2;color:#b91c1c}.rs.t{background:#ccfbf1;color:#0b5c56}
.tbl{width:100%;border-collapse:collapse;font-size:14px}
.tbl th{text-align:left;color:#6b7280;font-size:12.5px;padding:8px;border-bottom:2px solid #e5e7eb}
.tbl td{padding:8px;border-bottom:1px solid #e5e7eb}.tbl .r{text-align:right}
.pos{color:#15803d}.neg{color:#b91c1c}.muted{color:#6b7280}
.receipt-foot{text-align:center;color:#6b7280;font-size:12.5px;border-top:2px dashed #e5e7eb;padding-top:10px;margin-top:12px}`;
  const full = `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8" /><title>রসিদ — ${esc(r.member.name)}</title><link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&display=swap" rel="stylesheet" /><style>${css}</style></head><body>${$('#receipt-doc').outerHTML}</body></html>`;
  const blob = new Blob([full], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `রসিদ-${r.member.name}-${todayStr()}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('রসিদ ডাউনলোড হয়েছে ✓');
}
/* ---------------- রিপোর্ট ---------------- */
async function viewReports() {
  const nowY = new Date().getFullYear();
  const years = [];
  for (let y = nowY - 3; y <= nowY + 1; y++) years.push(y);
  $('#view').innerHTML = `
  <div class="page-head"><h2>📊 মাসিক ও বার্ষিক রিপোর্ট</h2></div>
  <div class="card">
    <h3>🗓️ মাস বেছে নিন</h3>
    <div class="filters">
      <select id="rp-month">${BN_MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
      <select id="rp-year">${years.map((y) => `<option value="${y}">${bn(y)}</option>`).join('')}</select>
      <button class="btn btn-primary" id="rp-show">দেখুন</button>
    </div>
    <div id="rp-monthly" style="margin-top:12px"></div>
  </div>
  <div class="card">
    <h3>📅 বার্ষিক রিপোর্ট — ${bn(state.report.year)}</h3>
    <div id="rp-yearly"></div>
  </div>`;
  $('#rp-month').value = state.report.month;
  $('#rp-year').value = state.report.year;
  $('#rp-show').onclick = () => {
    state.report.month = Number($('#rp-month').value);
    state.report.year = Number($('#rp-year').value);
    renderRoute();
  };
  await renderMonthlyReport();
  await renderYearlyReport();
}
async function renderMonthlyReport() {
  const r = await api(`/reports/monthly?year=${state.report.year}&month=${state.report.month}`);
  const f = r.family, b = r.business;
  const catRows = Object.entries(f.byCategory).sort((a, c) => c[1] - a[1]);
  $('#rp-monthly').innerHTML = `
    <p class="muted" style="margin-bottom:8px"><b>${BN_MONTHS[r.month - 1]} ${bn(r.year)}</b> — সারসংক্ষেপ</p>
    <div class="stat-grid cols-4">
      <div class="stat tint-green"><small>মাসের আয়</small><b>${fmt(f.income)}</b></div>
      <div class="stat tint-red"><small>মাসের খরচ</small><b>${fmt(f.expense)}</b></div>
      <div class="stat tint-teal"><small>সঞ্চয়</small><b>${fmtSigned(f.savings)}</b></div>
      <div class="stat tint-gold"><small>ব্যবসায় লাভ</small><b>${fmt(b.profit)}</b><span class="sub">বিক্রি ${fmt(b.salesTotal)} (${bn(b.salesCount)}টি)</span></div>
    </div>
    <h3 style="margin:16px 0 8px">খাত অনুযায়ী খরচ</h3>
    ${catRows.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${catRows.map(([c, a]) => `<tr><td>${esc(c)}</td><td class="r"><b>${fmt(a)}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">এই মাসে কোনো খরচ নেই</p>'}
    <h3 style="margin:16px 0 8px">সদস্য অনুযায়ী (কে কত দিলেন / খরচ করলেন)</h3>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>সদস্য</th><th class="r">জমা দিয়েছেন</th><th class="r">খরচ করেছেন</th></tr></thead><tbody>
      ${f.byMember.map((m) => `<tr><td>${esc(m.name)}</td><td class="r pos"><b>${fmt(m.income)}</b></td><td class="r neg"><b>${fmt(m.expense)}</b></td></tr>`).join('')}
    </tbody></table></div>`;
}
async function renderYearlyReport() {
  const r = await api(`/reports/yearly?year=${state.report.year}`);
  $('#rp-yearly').innerHTML = `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>মাস</th><th class="r">পারিবারিক আয়</th><th class="r">পারিবারিক খরচ</th><th class="r">ব্যবসায় বিক্রি</th><th class="r">ব্যবসায় লাভ</th></tr></thead><tbody>
    ${r.months.map((m) => `<tr><td>${BN_MONTHS[m.month - 1]}</td><td class="r pos">${fmt(m.income)}</td><td class="r neg">${fmt(m.expense)}</td><td class="r">${fmt(m.sales)}</td><td class="r"><b>${fmt(m.profit)}</b></td></tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------------- সেটিংস (পিন বদল) ---------------- */
function openSettings() {
  openModal('⚙️ সেটিংস — পিন বদলান', `
    <p class="muted" style="font-size:13.5px">নিরাপত্তার জন্য মাঝে মাঝে পিন বদলে নিন।</p>
    ${field('পুরনো পিন', '<input type="password" name="oldPin" inputmode="numeric" maxlength="8" required />')}
    ${field('নতুন পিন (৪–৮ সংখ্যা)', '<input type="password" name="newPin" inputmode="numeric" maxlength="8" required />')}
  `, async (fd, close) => {
    await api('/change-pin', { method: 'POST', body: fd });
    close();
    toast('পিন সফলভাবে বদলে গেছে ✓');
  }, 'পিন বদলান');
}


/**
 * ============================================================
 *  পারিবারিক হিসাব ও কাপড় ব্যবসা — মূল সার্ভার
 *  Family Finance & Cloth Business Management Server
 * ============================================================
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ---------- পিন হ্যাশিং (scrypt) ---------- */
function hashPin(pin, salt) {
  salt = salt || crypto.randomBytes(8).toString('hex');
  const h = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${h}`;
}
function verifyPin(pin, stored) {
  try {
    const [salt, h] = String(stored).split(':');
    const calc = crypto.scryptSync(String(pin), salt, 32);
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), calc);
  } catch (e) { return false; }
}

/* ---------- ক্যাটাগরি ---------- */
const EXPENSE_CATEGORIES = ['খাবার/বাজার', 'বাড়ি ভাড়া', 'বিদ্যুৎ বিল', 'গ্যাস বিল', 'পড়াশোনা', 'চিকিৎসা', 'যাতায়াত', 'অন্যান্য'];
const INCOME_CATEGORIES = ['বেতন/উপার্জন', 'ব্যবসা থেকে আয়', 'উপহার', 'অন্যান্য'];

/* ---------- সময় সহায়ক ---------- */
function day(offset) { const x = new Date(); x.setDate(x.getDate() - offset); return x.toISOString().slice(0, 10); }
function nowIso() { return new Date().toISOString(); }
function validDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); }

/* ---------- প্রাথমিক ডেটা (প্রথমবার চালু হলে তৈরি হয়) ---------- */
function seedDb() {
  const members = [
    { id: 1, key: 'priya',    name: 'প্রিয়া',    role: 'member',   pin: hashPin('1234') },
    { id: 2, key: 'moun',     name: 'মৌন',       role: 'member',   pin: hashPin('1234') },
    { id: 3, key: 'maruf',    name: 'মারুফ',     role: 'earner',   pin: hashPin('1234') },
    { id: 4, key: 'minu',     name: 'মিনু',      role: 'member',   pin: hashPin('1234') },
    { id: 5, key: 'sakhawat', name: 'সাখাওয়াত', role: 'business', pin: hashPin('1234') },
    { id: 6, key: 'titli',    name: 'তিতলী',     role: 'member',   pin: hashPin('1234') },
    { id: 7, key: 'admin',    name: 'অ্যাডমিন',  role: 'admin',    pin: hashPin('1212') }
  ];
  const products = [
    { id: 1, name: 'জামদানি শাড়ি',   quantity: 12, purchasePrice: 1450, sellingPrice: 2100 },
    { id: 2, name: 'কটন শাড়ি',      quantity: 20, purchasePrice: 650,  sellingPrice: 950 },
    { id: 3, name: 'লুঙ্গি',          quantity: 35, purchasePrice: 220,  sellingPrice: 320 },
    { id: 4, name: 'গামছা',          quantity: 40, purchasePrice: 90,   sellingPrice: 140 },
    { id: 5, name: 'থান কাপড় (গজ)', quantity: 60, purchasePrice: 180,  sellingPrice: 260 },
    { id: 6, name: 'পাঞ্জাবি',        quantity: 10, purchasePrice: 750,  sellingPrice: 1150 }
  ].map(p => ({ ...p, createdAt: nowIso() }));
  const purchases = [
    { id: 1, productId: 1, qty: 15, unitPrice: 1450, total: 15 * 1450, storeName: 'আরিফ টেক্সটাইল',        date: day(20) },
    { id: 2, productId: 2, qty: 25, unitPrice: 650,  total: 25 * 650,  storeName: 'ঢাকা কটন হাউস',        date: day(20) },
    { id: 3, productId: 3, qty: 40, unitPrice: 220,  total: 40 * 220,  storeName: 'আরিফ টেক্সটাইল',        date: day(15) },
    { id: 4, productId: 4, qty: 45, unitPrice: 90,   total: 45 * 90,   storeName: 'আরিফ টেক্সটাইল',        date: day(15) },
    { id: 5, productId: 5, qty: 70, unitPrice: 180,  total: 70 * 180,  storeName: 'নারায়ণগঞ্জ ক্লথ স্টোর', date: day(12) },
    { id: 6, productId: 6, qty: 12, unitPrice: 750,  total: 12 * 750,  storeName: 'ঢাকা কটন হাউস',        date: day(8) }
  ].map(x => ({ note: '', createdBy: 5, createdAt: nowIso(), ...x }));
  const S = (id, productId, qty, unitPrice, unitCost, off, note) =>
    ({ id, productId, qty, unitPrice, unitCost, total: qty * unitPrice, date: day(off), note: note || '', createdBy: 5, createdAt: nowIso() });
  const sales = [
    S(1, 1, 1, 2100, 1450, 6, 'খুচরা বিক্রি'), S(2, 2, 2, 950, 650, 5), S(3, 3, 3, 320, 220, 3),
    S(4, 5, 4, 260, 180, 2), S(5, 2, 3, 950, 650, 1, 'পাইকারি অর্ডার'), S(6, 1, 2, 2100, 1450, 0),
    S(7, 4, 5, 140, 90, 0), S(8, 6, 2, 1150, 750, 0), S(9, 3, 2, 320, 220, 0), S(10, 5, 6, 260, 180, 0)
  ];
  const T = (id, type, amount, category, note, memberId, off) =>
    ({ id, type, amount, category, note: note || '', date: day(off), memberId, createdBy: memberId, createdAt: nowIso() });
  const transactions = [
    T(1, 'income', 30000, 'বেতন/উপার্জন', 'জুলাই মাসের খরচ', 3, 27),
    T(2, 'expense', 8000, 'বাড়ি ভাড়া', '', 4, 10),
    T(3, 'expense', 950, 'গ্যাস বিল', '', 4, 9),
    T(4, 'expense', 1350, 'বিদ্যুৎ বিল', '', 1, 8),
    T(5, 'expense', 4500, 'খাবার/বাজার', 'সাপ্তাহিক বাজার', 4, 6),
    T(6, 'income', 25000, 'বেতন/উপার্জন', '', 3, 12),
    T(7, 'expense', 2200, 'পড়াশোনা', 'বই ও খাতা', 6, 4),
    T(8, 'expense', 1800, 'চিকিৎসা', 'ওষুধ কেনা', 2, 2),
    T(9, 'expense', 3200, 'খাবার/বাজার', '', 1, 1),
    T(10, 'income', 20000, 'বেতন/উপার্জন', 'আগস্ট মাসের খরচ', 3, 0),
    T(11, 'expense', 600, 'যাতায়াত', '', 6, 0)
  ];
  const dues = [
    { id: 1, type: 'receivable', storeName: 'নিউ মার্কেট ক্লথ স্টোর', amount: 15000, date: day(9),  status: 'unpaid', paidDate: null,   note: 'শাড়ি বিক্রির বাকি', createdBy: 5, createdAt: nowIso() },
    { id: 2, type: 'payable',   storeName: 'আরিফ টেক্সটাইল',          amount: 22000, date: day(12), status: 'unpaid', paidDate: null,   note: 'কাপড় কেনার বাকি',   createdBy: 5, createdAt: nowIso() },
    { id: 3, type: 'receivable', storeName: 'পার্সোনা ফ্যাশন',         amount: 6500,  date: day(25), status: 'paid',   paidDate: day(18), note: '',                   createdBy: 5, createdAt: nowIso() },
    { id: 4, type: 'payable',   storeName: 'ঢাকা কটন হাউস',           amount: 9000,  date: day(30), status: 'paid',   paidDate: day(22), note: '',                   createdBy: 5, createdAt: nowIso() }
  ];
  return {
    members, products, purchases, sales, transactions, dues,
    sessions: {},
    meta: { seededAt: nowIso(), counters: { members: 7, products: 6, purchases: 6, sales: 10, transactions: 11, dues: 4 } }
  };
}

/* ---------- ডেটাবেস লোড/সেভ (JSON ফাইল) ---------- */
let db = null;
function loadDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (e) { console.error('DB পড়া যায়নি, নতুন DB তৈরি হচ্ছে:', e.message); db = seedDb(); saveDb(); }
  } else {
    db = seedDb(); saveDb();
    console.log('✔ প্রাথমিক ডেটা তৈরি হয়েছে →', DB_FILE);
  }
  if (!db.sessions) db.sessions = {};
}
function saveDb() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1)); }
function nextId(coll) { db.meta.counters[coll] = (db.meta.counters[coll] || 0) + 1; return db.meta.counters[coll]; }
loadDb();

/* ---------- অ্যাপ সেটআপ ---------- */
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const broadcast = () => io.emit('sync', { at: Date.now() });

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  req.cookies = {};
  const h = req.headers.cookie;
  if (h) h.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) req.cookies[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- সহায়ক ---------- */
const pub = (m) => ({ id: m.id, name: m.name, role: m.role, key: m.key });
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x.amount), 0);
const bad = (res, msg) => res.status(400).json({ error: msg });
const forbidden = (res, msg) => res.status(403).json({ error: msg });
const notFound = (res, msg) => res.status(404).json({ error: msg });
const canIncomeRole = (m) => ['earner', 'admin'].includes(m.role);
const canBusinessRole = (m) => ['business', 'admin'].includes(m.role);
const productName = (id) => (db.products.find((p) => p.id === id) || {}).name || 'অজানা পণ্য';

function auth(req, res, next) {
  const s = db.sessions[req.cookies.sid];
  const me = s && db.members.find((x) => x.id === s.memberId);
  if (!me) return res.status(401).json({ error: 'লগইন প্রয়োজন' });
  req.me = me;
  next();
}
function bizAuth(req, res, next) {
  auth(req, res, () => {
    if (!canBusinessRole(req.me)) return forbidden(res, 'শুধু সাখাওয়াত বা অ্যাডমিন ব্যবসার তথ্য বদলাতে পারবেন');
    next();
  });
}

/* ---------- লগইন/লগআউট/সদস্য ---------- */
app.get('/api/members-public', (req, res) => {
  res.json(db.members.map((m) => ({ id: m.id, name: m.name, role: m.role })));
});
app.post('/api/login', (req, res) => {
  const { memberId, pin } = req.body || {};
  const m = db.members.find((x) => x.id === Number(memberId));
  if (!m || !verifyPin(pin ?? '', m.pin)) return res.status(401).json({ error: 'ভুল পিন! আবার চেষ্টা করুন।' });
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { memberId: m.id, createdAt: nowIso() };
  saveDb();
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ ok: true, me: pub(m) });
});
app.post('/api/logout', auth, (req, res) => {
  delete db.sessions[req.cookies.sid];
  saveDb();
  res.clearCookie('sid');
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json({ me: pub(req.me) }));
app.get('/api/members', auth, (req, res) => res.json(db.members.map(pub)));
app.get('/api/categories', auth, (req, res) => res.json({ expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES }));
app.post('/api/change-pin', auth, (req, res) => {
  const { oldPin, newPin } = req.body || {};
  if (!verifyPin(oldPin ?? '', req.me.pin)) return bad(res, 'পুরনো পিন ভুল হয়েছে');
  if (!/^[0-9]{4,8}$/.test(String(newPin || ''))) return bad(res, 'নতুন পিন ৪–৮ সংখ্যার হতে হবে');
  const m = db.members.find((x) => x.id === req.me.id);
  m.pin = hashPin(newPin);
  saveDb();
  res.json({ ok: true });
});
/* ---------- সামারি (ড্যাশবোর্ড) ---------- */
app.get('/api/summary', auth, (req, res) => {
  const t = db.transactions;
  const today = day(0);
  const mk = today.slice(0, 7);
  const totalIncome = sum(t.filter((x) => x.type === 'income'));
  const totalExpense = sum(t.filter((x) => x.type === 'expense'));
  const monthTx = t.filter((x) => (x.date || '').startsWith(mk));
  const profitOf = (arr) => sum(arr, (x) => x.total) - sum(arr, (x) => x.qty * x.unitCost);
  const todaySales = db.sales.filter((x) => x.date === today);
  const monthSales = db.sales.filter((x) => (x.date || '').startsWith(mk));
  res.json({
    family: {
      totalIncome, totalExpense, balance: totalIncome - totalExpense,
      monthIncome: sum(monthTx.filter((x) => x.type === 'income')),
      monthExpense: sum(monthTx.filter((x) => x.type === 'expense'))
    },
    business: {
      totalSales: sum(db.sales, (x) => x.total),
      grossProfit: profitOf(db.sales),
      totalPurchases: sum(db.purchases, (x) => x.total),
      stockQty: sum(db.products, (x) => x.quantity),
      stockValue: sum(db.products, (x) => x.quantity * x.purchasePrice),
      stockItems: db.products.length,
      today: { sales: sum(todaySales, (x) => x.total), profit: profitOf(todaySales) },
      month: { sales: sum(monthSales, (x) => x.total), profit: profitOf(monthSales) }
    },
    dues: {
      receivableUnpaid: sum(db.dues.filter((x) => x.type === 'receivable' && x.status === 'unpaid')),
      payableUnpaid: sum(db.dues.filter((x) => x.type === 'payable' && x.status === 'unpaid'))
    },
    recent: [
      ...t.map((x) => ({ kind: x.type, id: x.id, date: x.date, amount: x.amount, category: x.category, note: x.note, memberId: x.memberId, createdAt: x.createdAt })),
      ...db.sales.map((x) => ({ kind: 'sale', id: x.id, date: x.date, amount: x.total, category: productName(x.productId), note: x.note, qty: x.qty, memberId: x.createdBy, createdAt: x.createdAt }))
    ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 10)
  });
});

/* ---------- আয়-ব্যয় (লেনদেন) ---------- */
app.get('/api/transactions', auth, (req, res) => {
  let out = [...db.transactions];
  const { type, memberId } = req.query;
  const y = Number(req.query.year), m = Number(req.query.month);
  if (['income', 'expense'].includes(type)) out = out.filter((x) => x.type === type);
  if (y && m) { const mk = `${y}-${String(m).padStart(2, '0')}`; out = out.filter((x) => (x.date || '').startsWith(mk)); }
  if (memberId && memberId !== 'all') out = out.filter((x) => x.memberId === Number(memberId));
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  res.json(out);
});
app.post('/api/transactions', auth, (req, res) => {
  const me = req.me;
  const { type, category, note, date } = req.body || {};
  const amount = Number(req.body && req.body.amount);
  if (!['income', 'expense'].includes(type)) return bad(res, 'ধরন সঠিক নয়');
  if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'সঠিক পরিমাণ (টাকা) দিন');
  if (type === 'income' && !canIncomeRole(me)) return forbidden(res, 'শুধু মারুফ বা অ্যাডমিন আয় যোগ করতে পারবেন');
  let memberId = me.id;
  if (me.role === 'admin' && req.body.memberId) {
    const m2 = db.members.find((x) => x.id === Number(req.body.memberId));
    if (!m2) return bad(res, 'সদস্য পাওয়া যায়নি');
    memberId = m2.id;
  }
  const tx = {
    id: nextId('transactions'), type, amount: Math.round(amount),
    category: String(category || 'অন্যান্য').slice(0, 60),
    note: String(note || '').slice(0, 200),
    date: validDate(date) ? date : day(0),
    memberId, createdBy: me.id, createdAt: nowIso()
  };
  db.transactions.push(tx);
  saveDb(); broadcast();
  res.json({ ok: true, tx });
});
app.delete('/api/transactions/:id', auth, (req, res) => {
  const i = db.transactions.findIndex((x) => x.id === Number(req.params.id));
  if (i === -1) return notFound(res, 'লেনদেন পাওয়া যায়নি');
  const tx = db.transactions[i];
  if (req.me.role !== 'admin' && tx.createdBy !== req.me.id) return forbidden(res, 'শুধু নিজের যোগ করা লেনদেন মুছতে পারবেন');
  db.transactions.splice(i, 1);
  saveDb(); broadcast();
  res.json({ ok: true });
});
/* ---------- পণ্য / স্টক ---------- */
app.get('/api/products', auth, (req, res) => res.json(db.products));
app.post('/api/products', bizAuth, (req, res) => {
  const { name } = req.body || {};
  const quantity = parseInt(req.body.quantity, 10) || 0;
  const purchasePrice = Number(req.body.purchasePrice);
  const sellingPrice = Number(req.body.sellingPrice);
  if (!name || !String(name).trim()) return bad(res, 'কাপড়ের নাম দিন');
  if (quantity < 0) return bad(res, 'পরিমাণ ঋণাত্মক হতে পারে না');
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return bad(res, 'সঠিক ক্রয়মূল্য দিন');
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return bad(res, 'সঠিক বিক্রয়মূল্য দিন');
  const p = {
    id: nextId('products'), name: String(name).trim().slice(0, 80), quantity,
    purchasePrice: Math.round(purchasePrice), sellingPrice: Math.round(sellingPrice), createdAt: nowIso()
  };
  db.products.push(p);
  saveDb(); broadcast();
  res.json({ ok: true, product: p });
});
app.put('/api/products/:id', bizAuth, (req, res) => {
  const p = db.products.find((x) => x.id === Number(req.params.id));
  if (!p) return notFound(res, 'পণ্য পাওয়া যায়নি');
  const { name } = req.body || {};
  const quantity = parseInt(req.body.quantity, 10);
  const purchasePrice = Number(req.body.purchasePrice);
  const sellingPrice = Number(req.body.sellingPrice);
  if (!name || !String(name).trim()) return bad(res, 'কাপড়ের নাম দিন');
  if (!Number.isInteger(quantity) || quantity < 0) return bad(res, 'সঠিক স্টক পরিমাণ দিন');
  if (!Number.isFinite(purchasePrice) || purchasePrice < 0) return bad(res, 'সঠিক ক্রয়মূল্য দিন');
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return bad(res, 'সঠিক বিক্রয়মূল্য দিন');
  p.name = String(name).trim().slice(0, 80);
  p.quantity = quantity;
  p.purchasePrice = Math.round(purchasePrice);
  p.sellingPrice = Math.round(sellingPrice);
  saveDb(); broadcast();
  res.json({ ok: true, product: p });
});
app.delete('/api/products/:id', bizAuth, (req, res) => {
  const id = Number(req.params.id);
  if (db.sales.some((x) => x.productId === id) || db.purchases.some((x) => x.productId === id)) {
    return bad(res, 'এই কাপড়ের বিক্রি/ক্রয়ের হিসাব আছে, তাই মুছা যাবে না');
  }
  const i = db.products.findIndex((x) => x.id === id);
  if (i === -1) return notFound(res, 'পণ্য পাওয়া যায়নি');
  db.products.splice(i, 1);
  saveDb(); broadcast();
  res.json({ ok: true });
});
/* ---------- বিক্রি (স্টক স্বয়ংক্রিয় কমে) ---------- */
app.get('/api/sales', auth, (req, res) => {
  const out = db.sales.map((x) => ({ ...x, productName: productName(x.productId), profit: x.total - x.qty * x.unitCost }));
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  res.json(out);
});
app.post('/api/sales', bizAuth, (req, res) => {
  const product = db.products.find((p) => p.id === Number(req.body.productId));
  if (!product) return bad(res, 'পণ্য পাওয়া যায়নি');
  const qty = parseInt(req.body.qty, 10);
  if (!Number.isInteger(qty) || qty <= 0) return bad(res, 'সঠিক পরিমাণ দিন');
  if (qty > product.quantity) return bad(res, `স্টকে মাত্র ${product.quantity} পিস আছে`);
  const unitPrice = req.body.unitPrice === undefined || req.body.unitPrice === '' ? product.sellingPrice : Number(req.body.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return bad(res, 'সঠিক বিক্রয়মূল্য দিন');
  product.quantity -= qty;
  const sale = {
    id: nextId('sales'), productId: product.id, qty, unitPrice: Math.round(unitPrice),
    unitCost: product.purchasePrice, total: Math.round(qty * unitPrice),
    date: validDate(req.body.date) ? req.body.date : day(0),
    note: String(req.body.note || '').slice(0, 200), createdBy: req.me.id, createdAt: nowIso()
  };
  db.sales.push(sale);
  saveDb(); broadcast();
  res.json({ ok: true, sale });
});
app.delete('/api/sales/:id', bizAuth, (req, res) => {
  const i = db.sales.findIndex((x) => x.id === Number(req.params.id));
  if (i === -1) return notFound(res, 'বিক্রির হিসাব পাওয়া যায়নি');
  const sale = db.sales[i];
  const product = db.products.find((p) => p.id === sale.productId);
  if (product) product.quantity += sale.qty; // স্টক ফিরিয়ে দেওয়া হলো
  db.sales.splice(i, 1);
  saveDb(); broadcast();
  res.json({ ok: true });
});

/* ---------- ক্রয় (স্টক স্বয়ংক্রিয় বাড়ে) ---------- */
app.get('/api/purchases', auth, (req, res) => {
  const out = db.purchases.map((x) => ({ ...x, productName: productName(x.productId) }));
  out.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  res.json(out);
});
app.post('/api/purchases', bizAuth, (req, res) => {
  const product = db.products.find((p) => p.id === Number(req.body.productId));
  if (!product) return bad(res, 'পণ্য পাওয়া যায়নি');
  const qty = parseInt(req.body.qty, 10);
  if (!Number.isInteger(qty) || qty <= 0) return bad(res, 'সঠিক পরিমাণ দিন');
  const unitPrice = req.body.unitPrice === undefined || req.body.unitPrice === '' ? product.purchasePrice : Number(req.body.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return bad(res, 'সঠিক ক্রয়মূল্য দিন');
  product.quantity += qty;
  product.purchasePrice = Math.round(unitPrice); // সর্বশেষ ক্রয়মূল্য হালনাগাদ
  const purchase = {
    id: nextId('purchases'), productId: product.id, qty, unitPrice: Math.round(unitPrice),
    total: Math.round(qty * unitPrice),
    storeName: String(req.body.storeName || '').slice(0, 80),
    date: validDate(req.body.date) ? req.body.date : day(0),
    note: String(req.body.note || '').slice(0, 200), createdBy: req.me.id, createdAt: nowIso()
  };
  db.purchases.push(purchase);
  saveDb(); broadcast();
  res.json({ ok: true, purchase });
});
app.delete('/api/purchases/:id', bizAuth, (req, res) => {
  const i = db.purchases.findIndex((x) => x.id === Number(req.params.id));
  if (i === -1) return notFound(res, 'ক্রয়ের হিসাব পাওয়া যায়নি');
  const purchase = db.purchases[i];
  const product = db.products.find((p) => p.id === purchase.productId);
  if (product) {
    if (product.quantity < purchase.qty) return bad(res, 'স্টকে পর্যাপ্ত পণ্য নেই, তাই এই ক্রয় মুছা যাবে না');
    product.quantity -= purchase.qty; // স্টক কমিয়ে দেওয়া হলো
  }
  db.purchases.splice(i, 1);
  saveDb(); broadcast();
  res.json({ ok: true });
});
/* ---------- বাকি/দেনা (পাওনা ও দেনা) ---------- */
app.get('/api/dues', auth, (req, res) => {
  let out = [...db.dues];
  if (['receivable', 'payable'].includes(req.query.type)) out = out.filter((x) => x.type === req.query.type);
  out.sort((a, b) => (a.status === b.status ? b.date.localeCompare(a.date) : a.status === 'unpaid' ? -1 : 1));
  res.json(out);
});
app.post('/api/dues', bizAuth, (req, res) => {
  const { type, storeName, note, date } = req.body || {};
  const amount = Number(req.body.amount);
  if (!['receivable', 'payable'].includes(type)) return bad(res, 'ধরন সঠিক নয় (পাওনা/দেনা)');
  if (!storeName || !String(storeName).trim()) return bad(res, 'দোকানের নাম দিন');
  if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'সঠিক পরিমাণ (টাকা) দিন');
  const due = {
    id: nextId('dues'), type, storeName: String(storeName).trim().slice(0, 80),
    amount: Math.round(amount),
    date: validDate(date) ? date : day(0),
    status: 'unpaid', paidDate: null,
    note: String(note || '').slice(0, 200), createdBy: req.me.id, createdAt: nowIso()
  };
  db.dues.push(due);
  saveDb(); broadcast();
  res.json({ ok: true, due });
});
app.put('/api/dues/:id', bizAuth, (req, res) => {
  const due = db.dues.find((x) => x.id === Number(req.params.id));
  if (!due) return notFound(res, 'হিসাব পাওয়া যায়নি');
  const { status, storeName, note, date } = req.body || {};
  if (status !== undefined) {
    if (!['paid', 'unpaid'].includes(status)) return bad(res, 'অবস্থা সঠিক নয়');
    due.status = status;
    due.paidDate = status === 'paid' ? day(0) : null;
  }
  if (storeName !== undefined) due.storeName = String(storeName).trim().slice(0, 80) || due.storeName;
  if (note !== undefined) due.note = String(note).slice(0, 200);
  if (date !== undefined && validDate(date)) due.date = date;
  if (req.body.amount !== undefined) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'সঠিক পরিমাণ দিন');
    due.amount = Math.round(amount);
  }
  saveDb(); broadcast();
  res.json({ ok: true, due });
});
app.delete('/api/dues/:id', bizAuth, (req, res) => {
  const i = db.dues.findIndex((x) => x.id === Number(req.params.id));
  if (i === -1) return notFound(res, 'হিসাব পাওয়া যায়নি');
  db.dues.splice(i, 1);
  saveDb(); broadcast();
  res.json({ ok: true });
});
/* ---------- রিপোর্ট: মাসিক ---------- */
app.get('/api/reports/monthly', auth, (req, res) => {
  const y = Number(req.query.year), m = Number(req.query.month);
  if (!y || !m || m < 1 || m > 12) return bad(res, 'সঠিক মাস ও বছর দিন');
  const mk = `${y}-${String(m).padStart(2, '0')}`;
  const tx = db.transactions.filter((x) => (x.date || '').startsWith(mk));
  const income = sum(tx.filter((x) => x.type === 'income'));
  const expense = sum(tx.filter((x) => x.type === 'expense'));
  const byCategory = {};
  tx.filter((x) => x.type === 'expense').forEach((x) => { byCategory[x.category] = (byCategory[x.category] || 0) + x.amount; });
  const byMember = db.members.filter((mm) => mm.role !== 'admin').map((mm) => ({
    id: mm.id, name: mm.name,
    income: sum(tx.filter((x) => x.type === 'income' && x.memberId === mm.id)),
    expense: sum(tx.filter((x) => x.type === 'expense' && x.memberId === mm.id))
  }));
  const sales = db.sales.filter((x) => (x.date || '').startsWith(mk));
  const purchases = db.purchases.filter((x) => (x.date || '').startsWith(mk));
  const salesTotal = sum(sales, (x) => x.total);
  const cogs = sum(sales, (x) => x.qty * x.unitCost);
  res.json({
    year: y, month: m,
    family: { income, expense, savings: income - expense, byCategory, byMember },
    business: { salesTotal, cogs, profit: salesTotal - cogs, salesCount: sales.length, purchasesTotal: sum(purchases, (x) => x.total), purchaseCount: purchases.length }
  });
});

/* ---------- রিপোর্ট: বার্ষিক ---------- */
app.get('/api/reports/yearly', auth, (req, res) => {
  const y = Number(req.query.year);
  if (!y) return bad(res, 'সঠিক বছর দিন');
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    const tx = db.transactions.filter((x) => (x.date || '').startsWith(mk));
    const sales = db.sales.filter((x) => (x.date || '').startsWith(mk));
    const salesTotal = sum(sales, (x) => x.total);
    const cogs = sum(sales, (x) => x.qty * x.unitCost);
    months.push({
      month: m,
      income: sum(tx.filter((x) => x.type === 'income')),
      expense: sum(tx.filter((x) => x.type === 'expense')),
      sales: salesTotal,
      profit: salesTotal - cogs
    });
  }
  res.json({ year: y, months });
});

/* ---------- ব্যক্তিগত রসিদ ---------- */
app.get('/api/receipt/:memberId', auth, (req, res) => {
  const me = req.me;
  const memberId = Number(req.params.memberId);
  if (me.role !== 'admin' && me.id !== memberId) return forbidden(res, 'শুধু নিজের রসিদ দেখতে পারবেন');
  const member = db.members.find((x) => x.id === memberId);
  if (!member) return notFound(res, 'সদস্য পাওয়া যায়নি');
  const from = validDate(req.query.from) ? req.query.from : null;
  const to = validDate(req.query.to) ? req.query.to : null;
  const items = db.transactions
    .filter((x) => x.memberId === memberId)
    .filter((x) => (!from || x.date >= from) && (!to || x.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((x) => ({ id: x.id, date: x.date, type: x.type, category: x.category, note: x.note, amount: x.amount }));
  const given = sum(items.filter((x) => x.type === 'income'));
  const spent = sum(items.filter((x) => x.type === 'expense'));
  res.json({
    rid: 'R' + Date.now().toString(36).toUpperCase(),
    member: { id: member.id, name: member.name },
    from, to,
    generatedAt: nowIso(), generatedBy: me.name,
    given, spent, net: given - spent, items
  });
});

/* ---------- 404 ও সার্ভার চালু ---------- */
app.use('/api', (req, res) => notFound(res, 'পাওয়া যায়নি'));
server.listen(PORT, () => {
  console.log('\n🧾 পারিবারিক হিসাব ও কাপড় ব্যবসা চালু হয়েছে!');
  console.log(`➜  http://localhost:${PORT}\n`);
});


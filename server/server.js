const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const cors = require('cors');

const PORT = process.env.PORT || 4000;
const DATA_PATH = path.join(__dirname, 'data', 'db.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DEFAULT_DB = { users: [], magazines: [], memberships: {}, products: {} };

function ensureDb() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function loadDb() {
  ensureDb();
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (error) {
    return { ...DEFAULT_DB };
  }
}

function saveDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function createToken(userId) {
  return Buffer.from(`${userId}:${Date.now()}`).toString('base64');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: 'Brak nagłówka autoryzacji' });
  const token = header.replace('Bearer ', '');
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [userId] = decoded.split(':');
    const db = loadDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) return res.status(401).json({ message: 'Niepoprawny token' });
    req.user = user;
    req.db = db;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Nie można zweryfikować tokenu' });
  }
}

function ensureMembership(db, userId) {
  if (!db.memberships[userId]) db.memberships[userId] = [];
  return db.memberships[userId];
}

function magazineAccessMiddleware(req, res, next) {
  const { magazineId } = req.params;
  const memberships = ensureMembership(req.db, req.user.id);
  if (!memberships.includes(magazineId)) {
    return res.status(403).json({ message: 'Brak dostępu do magazynu' });
  }
  req.magazineId = magazineId;
  next();
}

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło do konta' });
  }
  const db = loadDb();
  if (db.users.some((u) => u.username === username)) {
    return res.status(409).json({ message: 'Użytkownik o takim nicku już istnieje' });
  }
  const user = { id: uuid(), username, password: hashPassword(password) };
  db.users.push(user);
  saveDb(db);
  const token = createToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło do konta' });
  }
  const db = loadDb();
  const user = db.users.find((u) => u.username === username);
  if (!user || user.password !== hashPassword(password)) {
    return res.status(401).json({ message: 'Niepoprawny nick lub hasło' });
  }
  const token = createToken(user.id);
  res.json({ token, user: { id: user.id, username: user.username } });
});

app.get('/api/magazines', authMiddleware, (req, res) => {
  const { db, user } = req;
  const memberships = ensureMembership(db, user.id);
  const items = memberships
    .map((id) => db.magazines.find((m) => m.id === id))
    .filter(Boolean)
    .map(({ id, name, ownerId }) => ({ id, name, ownerId }));
  res.json(items);
});

app.post('/api/magazines', authMiddleware, (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło magazynu' });
  }
  const db = req.db;
  if (db.magazines.some((m) => m.name === name)) {
    return res.status(409).json({ message: 'Magazyn o takiej nazwie już istnieje' });
  }
  const magazine = { id: uuid(), name, password: hashPassword(password), ownerId: req.user.id };
  db.magazines.push(magazine);
  ensureMembership(db, req.user.id).push(magazine.id);
  db.products[magazine.id] = [];
  saveDb(db);
  res.status(201).json({ id: magazine.id, name: magazine.name, ownerId: magazine.ownerId });
});

app.post('/api/magazines/connect', authMiddleware, (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło magazynu' });
  }
  const db = req.db;
  const magazine = db.magazines.find((m) => m.name === name);
  if (!magazine || magazine.password !== hashPassword(password)) {
    return res.status(401).json({ message: 'Niepoprawna nazwa magazynu lub hasło' });
  }
  const memberships = ensureMembership(db, req.user.id);
  if (!memberships.includes(magazine.id)) memberships.push(magazine.id);
  saveDb(db);
  res.json({ id: magazine.id, name: magazine.name, ownerId: magazine.ownerId });
});

app.get('/api/magazines/:magazineId/products', authMiddleware, magazineAccessMiddleware, (req, res) => {
  const items = req.db.products[req.magazineId] || [];
  res.json(items);
});

app.post('/api/magazines/:magazineId/products', authMiddleware, magazineAccessMiddleware, (req, res) => {
  const product = { ...req.body, id: uuid(), createdAt: Date.now() };
  const items = req.db.products[req.magazineId] || [];
  items.unshift(product);
  req.db.products[req.magazineId] = items;
  saveDb(req.db);
  res.status(201).json(product);
});

app.put('/api/magazines/:magazineId/products/:id', authMiddleware, magazineAccessMiddleware, (req, res) => {
  const items = req.db.products[req.magazineId] || [];
  const index = items.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Produkt nie istnieje' });
  const updated = { ...items[index], ...req.body, id: req.params.id };
  items[index] = updated;
  req.db.products[req.magazineId] = items;
  saveDb(req.db);
  res.json(updated);
});

app.delete('/api/magazines/:magazineId/products/:id', authMiddleware, magazineAccessMiddleware, (req, res) => {
  const items = req.db.products[req.magazineId] || [];
  const index = items.findIndex((p) => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Produkt nie istnieje' });
  items.splice(index, 1);
  req.db.products[req.magazineId] = items;
  saveDb(req.db);
  res.status(204).end();
});

app.listen(PORT, () => {
  ensureDb();
  console.log(`API startuje na porcie ${PORT}`);
});

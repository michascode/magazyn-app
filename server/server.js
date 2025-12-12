require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuid } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const DATABASE_URL = process.env.DATABASE_URL;
const DATABASE_SSL = (process.env.DATABASE_SSL || '').toLowerCase() === 'true' ||
  (DATABASE_URL || '').includes('supabase.co');
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOW_ALL_ORIGINS = CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes('*');

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET nie ustawiony - używany jest klucz deweloperski.');
}
const DATA_PATH = path.join(__dirname, 'data', 'db.json');
const DEFAULT_DB = { users: [], magazines: [], memberships: {}, products: {} };
const useMemoryStore = !DATABASE_URL;

function loadJsonDb() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    return { ...DEFAULT_DB };
  }

  let client;
  try {
    const content = fs.readFileSync(DATA_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return { ...DEFAULT_DB, ...parsed };
  } catch (error) {
    console.warn('Nie udało się wczytać server/data/db.json, używam pustego zestawu danych.');
    return { ...DEFAULT_DB };
  }
}

function persistJsonDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}

const memoryDb = useMemoryStore ? loadJsonDb() : null;

if (useMemoryStore) {
  console.warn('DATABASE_URL nie ustawiony – API korzysta z lokalnego pliku server/data/db.json.');
}

const pool = useMemoryStore
  ? null
  : new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    });

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOW_ALL_ORIGINS || CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

const app = express();
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

function buildQueryFilters(query, startingIndex = 1) {
  const conditions = [];
  const values = [];
  let index = startingIndex;

  const addArrayFilter = (field, value) => {
    const items = (value || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (items.length) {
      conditions.push(`${field} = ANY($${index})`);
      values.push(items);
      index += 1;
    }
  };

  if (query.search) {
    conditions.push(`LOWER(p.name) LIKE $${index}`);
    values.push(`%${query.search.toLowerCase()}%`);
    index += 1;
  }

  if (query.code) {
    conditions.push(`LOWER(p.code) LIKE $${index}`);
    values.push(`%${query.code.toLowerCase()}%`);
    index += 1;
  }

  addArrayFilter('p.brand', query.brand);
  addArrayFilter('p.size', query.size);
  addArrayFilter('p.condition', query.condition);
  addArrayFilter('p.drop_tag', query.drop);

  return { conditions, values, index };
}

function mapOrderBy(sort) {
  switch (sort) {
    case 'cena-rosnaco':
      return 'p.price ASC NULLS LAST';
    case 'cena-malejaco':
      return 'p.price DESC NULLS LAST';
    case 'az':
      return 'p.name ASC';
    case 'za':
      return 'p.name DESC';
    case 'najstarsze':
      return 'p.created_at ASC';
    case 'najnowsze':
    default:
      return 'p.created_at DESC';
  }
}

function getMemberships(userId) {
  if (!useMemoryStore) return [];
  const list = memoryDb.memberships[userId] || [];
  return Array.from(new Set(list));
}

function ensureMembership(userId, warehouseId) {
  if (!useMemoryStore) return;
  const list = getMemberships(userId);
  if (!list.includes(warehouseId)) {
    memoryDb.memberships[userId] = [...list, warehouseId];
  }
}

function removeMembership(userId, warehouseId) {
  if (!useMemoryStore) return;
  const list = getMemberships(userId).filter((id) => id !== warehouseId);
  if (list.length > 0) memoryDb.memberships[userId] = list;
  else delete memoryDb.memberships[userId];
}

function mapProductRow(row) {
  const images = Array.isArray(row.images) ? row.images : [];
  const mainImageId = row.mainImageId || images[0]?.id || null;

  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    name: row.name,
    brand: row.brand,
    size: row.size,
    condition: row.condition,
    drop: row.drop,
    price: row.price !== null ? Number(row.price) : null,
    code: row.code,
    a: row.a !== null ? Number(row.a) : null,
    b: row.b !== null ? Number(row.b) : null,
    c: row.c !== null ? Number(row.c) : null,
    createdAt: Number(row.createdAt),
    images,
    mainImageId,
  };
}

async function fetchAvailableFilters(magazineId) {
  if (useMemoryStore) {
    const products = memoryDb.products[magazineId] || [];
    const acc = { brand: new Set(), size: new Set(), condition: new Set(), drop: new Set() };
    products.forEach((p) => {
      if (p.brand) acc.brand.add(p.brand);
      if (p.size) acc.size.add(p.size);
      if (p.condition) acc.condition.add(p.condition);
      if (p.drop) acc.drop.add(p.drop);
    });
    return {
      brand: Array.from(acc.brand),
      size: Array.from(acc.size),
      condition: Array.from(acc.condition),
      drop: Array.from(acc.drop),
    };
  }

  const { rows } = await pool.query(
    `SELECT
      array_remove(array_agg(DISTINCT brand), NULL) AS brand,
      array_remove(array_agg(DISTINCT size), NULL) AS size,
      array_remove(array_agg(DISTINCT condition), NULL) AS condition,
      array_remove(array_agg(DISTINCT drop_tag), NULL) AS drop
    FROM products
    WHERE warehouse_id = $1;`,
    [magazineId]
  );

  const filters = rows[0] || {};
  return {
    brand: filters.brand || [],
    size: filters.size || [],
    condition: filters.condition || [],
    drop: filters.drop || [],
  };
}

async function verifyPassword(password, hash) {
  if (hash && hash.startsWith('$2')) {
    return bcrypt.compare(password, hash);
  }

  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  return legacy === hash;
}

async function upgradeUserPasswordHash(userId, password, currentHash) {
  if (currentHash && currentHash.startsWith('$2')) return;
  const newHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);
}

async function upgradeWarehousePasswordHash(warehouseId, password, currentHash) {
  if (currentHash && currentHash.startsWith('$2')) return;
  const newHash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE warehouses SET password_hash = $1 WHERE id = $2', [newHash, warehouseId]);
}

function createToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function findUserByLogin(login) {
  if (!useMemoryStore) return null;
  return memoryDb.users.find((u) => u.username.toLowerCase() === login.toLowerCase()) || null;
}

function findMagazineByName(name) {
  if (!useMemoryStore) return null;
  return memoryDb.magazines.find((m) => m.name.toLowerCase() === name.toLowerCase()) || null;
}

function persistMemoryDb() {
  if (!useMemoryStore) return;
  persistJsonDb(memoryDb);
}

function mapMemoryProduct(raw) {
  const images = Array.isArray(raw.images) ? raw.images : [];
  return {
    ...raw,
    createdAt: raw.createdAt ?? Date.now(),
    price: raw.price ?? null,
    a: raw.a ?? null,
    b: raw.b ?? null,
    c: raw.c ?? null,
    images,
    mainImageId: raw.mainImageId || images[0]?.id || null,
  };
}

function filterMemoryProducts(products = [], query = {}) {
  return products.filter((p) => {
    if (query.search && !p.name?.toLowerCase().includes(query.search.toLowerCase())) return false;
    if (query.code && !p.code?.toLowerCase().includes(query.code.toLowerCase())) return false;

    const checkList = (key) => {
      const value = query[key];
      if (!value) return true;
      const allowed = value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      if (allowed.length === 0) return true;
      return allowed.includes(p[key]);
    };

    return checkList('brand') && checkList('size') && checkList('condition') && checkList('drop');
  });
}

function sortMemoryProducts(products = [], sort) {
  const list = [...products];
  switch (sort) {
    case 'cena-rosnaco':
      list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      break;
    case 'cena-malejaco':
      list.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
      break;
    case 'az':
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'za':
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      break;
    case 'najstarsze':
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      break;
    case 'najnowsze':
    default:
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      break;
  }
  return list;
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Brak tokenu Bearer' });
  }
  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (useMemoryStore) {
      const user = memoryDb.users.find((u) => u.id === payload.sub);
      if (!user) return res.status(401).json({ message: 'Niepoprawny token' });
      req.user = { id: user.id, username: user.username };
    } else {
      const { rows } = await pool.query('SELECT id, login FROM users WHERE id = $1', [payload.sub]);
      const user = rows[0];
      if (!user) {
        return res.status(401).json({ message: 'Niepoprawny token' });
      }
      req.user = { id: user.id, username: user.login };
    }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token wygasł' });
    }
    res.status(401).json({ message: 'Nie można zweryfikować tokenu' });
  }
}

async function magazineAccessMiddleware(req, res, next) {
  const { magazineId } = req.params;
  try {
    if (useMemoryStore) {
      const memberships = getMemberships(req.user.id);
      if (!memberships.includes(magazineId)) {
        return res.status(403).json({ message: 'Brak dostępu do magazynu' });
      }
      const magazine = memoryDb.magazines.find((m) => m.id === magazineId);
      if (!magazine) return res.status(404).json({ message: 'Magazyn nie istnieje' });
      req.magazine = { id: magazine.id, name: magazine.name, ownerId: magazine.ownerId };
    } else {
      const { rows } = await pool.query(
        `SELECT w.id, w.name, w.owner_id
         FROM warehouses w
         INNER JOIN warehouse_memberships wm ON wm.warehouse_id = w.id
         WHERE wm.user_id = $1 AND w.id = $2`,
        [req.user.id, magazineId]
      );

      const magazine = rows[0];
      if (!magazine) {
        return res.status(403).json({ message: 'Brak dostępu do magazynu' });
      }

      req.magazine = { id: magazine.id, name: magazine.name, ownerId: magazine.owner_id };
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się zweryfikować dostępu' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło do konta' });
  }

  try {
    if (useMemoryStore) {
      const exists = findUserByLogin(username);
      if (exists) return res.status(409).json({ message: 'Użytkownik o takim nicku już istnieje' });

      const id = uuid();
      const passwordHash = await bcrypt.hash(password, 10);
      memoryDb.users.push({ id, username, password: passwordHash });
      persistMemoryDb();

      const token = createToken(id);
      return res.status(201).json({ token, user: { id, username } });
    }

    const existing = await pool.query('SELECT 1 FROM users WHERE LOWER(login) = LOWER($1)', [username]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: 'Użytkownik o takim nicku już istnieje' });
    }

    const id = uuid();
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (id, login, password_hash) VALUES ($1, $2, $3)', [
      id,
      username,
      passwordHash,
    ]);

    const token = createToken(id);
    res.status(201).json({ token, user: { id, username } });
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się utworzyć konta' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło do konta' });
  }

  try {
    if (useMemoryStore) {
      const user = findUserByLogin(username);
      if (!user) return res.status(401).json({ message: 'Niepoprawny nick lub hasło' });

      const valid = await verifyPassword(password, user.password);
      if (!valid) return res.status(401).json({ message: 'Niepoprawny nick lub hasło' });

      const token = createToken(user.id);
      return res.json({ token, user: { id: user.id, username: user.username } });
    }

    const { rows } = await pool.query('SELECT id, login, password_hash FROM users WHERE LOWER(login) = LOWER($1)', [
      username,
    ]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Niepoprawny nick lub hasło' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Niepoprawny nick lub hasło' });
    }

    await upgradeUserPasswordHash(user.id, password, user.password_hash);

    const token = createToken(user.id);
    res.json({ token, user: { id: user.id, username: user.login } });
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się zalogować' });
  }
});

app.get('/api/magazines', authMiddleware, async (req, res) => {
  try {
    if (useMemoryStore) {
      const magazineIds = getMemberships(req.user.id);
      const list = memoryDb.magazines
        .filter((m) => magazineIds.includes(m.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      return res.json(list.map((m) => ({ id: m.id, name: m.name, ownerId: m.ownerId })));
    }

    const { rows } = await pool.query(
      `SELECT w.id, w.name, w.owner_id
       FROM warehouses w
       INNER JOIN warehouse_memberships wm ON wm.warehouse_id = w.id
       WHERE wm.user_id = $1
       ORDER BY w.name`,
      [req.user.id]
    );
    res.json(rows.map((row) => ({ id: row.id, name: row.name, ownerId: row.owner_id })));
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się pobrać magazynów' });
  }
});

app.post('/api/magazines', authMiddleware, async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło magazynu' });
  }

  try {
    if (useMemoryStore) {
      const existing = findMagazineByName(name);
      if (existing) return res.status(409).json({ message: 'Magazyn o tej nazwie już istnieje' });

      const id = uuid();
      const passwordHash = await bcrypt.hash(password, 10);
      memoryDb.magazines.push({ id, name, password: passwordHash, ownerId: req.user.id });
      ensureMembership(req.user.id, id);
      persistMemoryDb();

      return res.status(201).json({ id, name, ownerId: req.user.id });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuid();

    await client.query(
      'INSERT INTO warehouses (id, name, password_hash, owner_id) VALUES ($1, $2, $3, $4)',
      [id, name, passwordHash, req.user.id]
    );
    await client.query(
      'INSERT INTO warehouse_memberships (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, id]
    );

    await client.query('COMMIT');
    res.status(201).json({ id, name, ownerId: req.user.id });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Magazyn o takim nicku już istnieje' });
    }
    res.status(500).json({ message: 'Nie udało się utworzyć magazynu' });
  } finally {
    client?.release();
  }
});

app.post('/api/magazines/connect', authMiddleware, async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło magazynu' });
  }

  try {
    if (useMemoryStore) {
      const magazine = findMagazineByName(name);
      if (!magazine) return res.status(401).json({ message: 'Niepoprawna nazwa magazynu lub hasło' });

      const valid = await verifyPassword(password, magazine.password);
      if (!valid) return res.status(401).json({ message: 'Niepoprawna nazwa magazynu lub hasło' });

      ensureMembership(req.user.id, magazine.id);
      persistMemoryDb();
      return res.json({ id: magazine.id, name: magazine.name, ownerId: magazine.ownerId });
    }

    const { rows } = await pool.query('SELECT * FROM warehouses WHERE LOWER(name) = LOWER($1)', [name]);
    const magazine = rows[0];
    if (!magazine) {
      return res.status(401).json({ message: 'Niepoprawna nazwa magazynu lub hasło' });
    }

    const valid = await verifyPassword(password, magazine.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Niepoprawna nazwa magazynu lub hasło' });
    }

    await upgradeWarehousePasswordHash(magazine.id, password, magazine.password_hash);

    await pool.query(
      'INSERT INTO warehouse_memberships (user_id, warehouse_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.id, magazine.id]
    );

    res.json({ id: magazine.id, name: magazine.name, ownerId: magazine.owner_id });
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się połączyć z magazynem' });
  }
});

app.delete('/api/magazines/:magazineId', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const { magazineId } = req.params;
  try {
    if (useMemoryStore) {
      const magazine = memoryDb.magazines.find((m) => m.id === magazineId);
      if (!magazine) return res.status(404).json({ message: 'Magazyn nie istnieje' });

      if (magazine.ownerId === req.user.id) {
        memoryDb.magazines = memoryDb.magazines.filter((m) => m.id !== magazineId);
        delete memoryDb.products[magazineId];
        Object.keys(memoryDb.memberships).forEach((userId) => removeMembership(userId, magazineId));
        persistMemoryDb();
        return res.json({ removed: true, scope: 'deleted' });
      }

      removeMembership(req.user.id, magazineId);
      persistMemoryDb();
      return res.json({ removed: true, scope: 'left' });
    }

    const { rows } = await pool.query('SELECT owner_id FROM warehouses WHERE id = $1', [magazineId]);
    const magazine = rows[0];
    if (!magazine) return res.status(404).json({ message: 'Magazyn nie istnieje' });

    if (magazine.owner_id === req.user.id) {
      await pool.query('DELETE FROM warehouses WHERE id = $1', [magazineId]);
      return res.json({ removed: true, scope: 'deleted' });
    }

    await pool.query('DELETE FROM warehouse_memberships WHERE user_id = $1 AND warehouse_id = $2', [
      req.user.id,
      magazineId,
    ]);
    res.json({ removed: true, scope: 'left' });
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się usunąć magazynu' });
  }
});

app.get('/api/magazines/:magazineId/products', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  try {
    if (useMemoryStore) {
      const warehouseProducts = (memoryDb.products[req.magazine.id] || []).map(mapMemoryProduct);
      const filtered = filterMemoryProducts(warehouseProducts, req.query);
      const sorted = sortMemoryProducts(filtered, req.query.sort);
      const total = sorted.length;
      const paged = sorted.slice(offset, offset + pageSize);
      const filtersData = await fetchAvailableFilters(req.magazine.id);

      return res.json({
        items: paged,
        total,
        page,
        pageSize,
        filters: filtersData,
      });
    }

    const filters = buildQueryFilters(req.query, 2);
    const baseConditions = ['p.warehouse_id = $1', ...filters.conditions];
    const whereClause = baseConditions.length ? `WHERE ${baseConditions.join(' AND ')}` : '';
    const params = [req.magazine.id, ...filters.values];
    const orderBy = mapOrderBy(req.query.sort);

    const totalQuery = `SELECT COUNT(*) FROM products p ${whereClause}`;
    const totalResult = await pool.query(totalQuery, params);
    const total = Number(totalResult.rows[0].count) || 0;

    const itemsQuery = `
      SELECT
        p.id,
        p.warehouse_id,
        p.name,
        p.brand,
        p.size,
        p.condition,
        p.drop_tag AS drop,
        p.price,
        p.code,
        p.a,
        p.b,
        p.c,
        p.main_image_id AS "mainImageId",
        EXTRACT(EPOCH FROM p.created_at) * 1000 AS "createdAt",
        COALESCE(
          (
            SELECT json_agg(json_build_object('id', i.id, 'url', i.url, 'position', i.position) ORDER BY i.position)
            FROM product_images i
            WHERE i.product_id = p.id
          ),
          '[]'
        ) AS images
      FROM products p
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const { rows } = await pool.query(itemsQuery, [...params, pageSize, offset]);
    const filtersData = await fetchAvailableFilters(req.magazine.id);

    res.json({
      items: rows.map(mapProductRow),
      total,
      page,
      pageSize,
      filters: filtersData,
    });
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się pobrać produktów' });
  }
});

async function persistImages(client, productId, images = []) {
  await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);

  for (const [index, image] of images.entries()) {
    const imageId = image.id || uuid();
    await client.query(
      'INSERT INTO product_images (id, product_id, url, position) VALUES ($1, $2, $3, $4)',
      [imageId, productId, image.url, index]
    );
  }
}

app.post('/api/magazines/:magazineId/products', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const product = req.body || {};
  const id = product.id || uuid();
  const createdAt = product.createdAt ? new Date(product.createdAt) : new Date();

  let client;
  try {
    if (useMemoryStore) {
      const existing = (memoryDb.products[req.magazine.id] || []).find((p) => p.id === id);
      if (existing) return res.status(409).json({ message: 'Produkt już istnieje' });

      const entry = mapMemoryProduct({ ...product, id, createdAt: createdAt.getTime(), warehouseId: req.magazine.id });
      memoryDb.products[req.magazine.id] = [...(memoryDb.products[req.magazine.id] || []), entry];
      persistMemoryDb();
      return res.status(201).json(entry);
    }

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO products (
        id, warehouse_id, name, brand, size, condition, drop_tag, price, code, a, b, c, created_at, main_image_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      )`,
      [
        id,
        req.magazine.id,
        product.name,
        product.brand || null,
        product.size || null,
        product.condition || null,
        product.drop || null,
        product.price ?? null,
        product.code || null,
        product.a ?? null,
        product.b ?? null,
        product.c ?? null,
        createdAt,
        product.mainImageId || null,
      ]
    );

    await persistImages(client, id, product.images);
    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT p.*, EXTRACT(EPOCH FROM p.created_at) * 1000 AS "createdAt",
        p.drop_tag AS drop,
        COALESCE((
          SELECT json_agg(json_build_object('id', i.id, 'url', i.url, 'position', i.position) ORDER BY i.position)
          FROM product_images i
          WHERE i.product_id = p.id
        ), '[]') AS images
      FROM products p
      WHERE p.id = $1`,
      [id]
    );

    res.status(201).json(mapProductRow(rows[0]));
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ message: 'Nie udało się utworzyć produktu' });
  } finally {
    client?.release();
  }
});

app.put('/api/magazines/:magazineId/products/:id', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const product = req.body || {};
  const { id } = req.params;

  let client;
  try {
    if (useMemoryStore) {
      const products = memoryDb.products[req.magazine.id] || [];
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) return res.status(404).json({ message: 'Produkt nie istnieje' });

      const merged = mapMemoryProduct({
        ...products[index],
        ...product,
        id,
        createdAt: product.createdAt ?? products[index].createdAt ?? Date.now(),
      });
      products[index] = merged;
      memoryDb.products[req.magazine.id] = products;
      persistMemoryDb();
      return res.json(merged);
    }

    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE products SET
        name = $1,
        brand = $2,
        size = $3,
        condition = $4,
        drop_tag = $5,
        price = $6,
        code = $7,
        a = $8,
        b = $9,
        c = $10,
        created_at = COALESCE($11, created_at),
        main_image_id = $12
      WHERE id = $13 AND warehouse_id = $14
      RETURNING *`,
      [
        product.name,
        product.brand || null,
        product.size || null,
        product.condition || null,
        product.drop || null,
        product.price ?? null,
        product.code || null,
        product.a ?? null,
        product.b ?? null,
        product.c ?? null,
        product.createdAt ? new Date(product.createdAt) : null,
        product.mainImageId || null,
        id,
        req.magazine.id,
      ]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Produkt nie istnieje' });
    }

    await persistImages(client, id, product.images);
    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT p.*, EXTRACT(EPOCH FROM p.created_at) * 1000 AS "createdAt",
        p.drop_tag AS drop,
        COALESCE((
          SELECT json_agg(json_build_object('id', i.id, 'url', i.url, 'position', i.position) ORDER BY i.position)
          FROM product_images i
          WHERE i.product_id = p.id
        ), '[]') AS images
      FROM products p
      WHERE p.id = $1`,
      [id]
    );

    res.json(mapProductRow(rows[0]));
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ message: 'Nie udało się zaktualizować produktu' });
  } finally {
    client?.release();
  }
});

app.delete('/api/magazines/:magazineId/products/:id', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    if (useMemoryStore) {
      const products = memoryDb.products[req.magazine.id] || [];
      const next = products.filter((p) => p.id !== id);
      if (next.length === products.length) return res.status(404).json({ message: 'Produkt nie istnieje' });
      memoryDb.products[req.magazine.id] = next;
      persistMemoryDb();
      return res.status(204).end();
    }

    const result = await pool.query('DELETE FROM products WHERE id = $1 AND warehouse_id = $2', [
      id,
      req.magazine.id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Produkt nie istnieje' });
    }
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: 'Nie udało się usunąć produktu' });
  }
});

app.get('/healthz', async (req, res) => {
  try {
    if (!useMemoryStore) {
      await pool.query('SELECT 1');
    }
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Healthcheck failed', error);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.listen(PORT, () => {
  console.log(`API startuje na porcie ${PORT}`);
});

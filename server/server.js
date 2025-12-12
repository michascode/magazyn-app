require('dotenv').config();
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

if (!DATABASE_URL) {
  console.error('DATABASE_URL nie jest ustawiony. Uzupełnij konfigurację bazy danych.');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET nie ustawiony - używany jest klucz deweloperski.');
}

const pool = new Pool({
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
  optionsSuccessStatus: 200,
};

const app = express();
app.use(cors(corsOptions));
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

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Brak tokenu Bearer' });
  }
  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT id, login FROM users WHERE id = $1', [payload.sub]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Niepoprawny token' });
    }
    req.user = { id: user.id, username: user.login };
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

  const client = await pool.connect();
  try {
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
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Magazyn o takim nicku już istnieje' });
    }
    res.status(500).json({ message: 'Nie udało się utworzyć magazynu' });
  } finally {
    client.release();
  }
});

app.post('/api/magazines/connect', authMiddleware, async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) {
    return res.status(400).json({ message: 'Wymagany nick i hasło magazynu' });
  }

  try {
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
  const client = await pool.connect();

  try {
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
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Nie udało się utworzyć produktu' });
  } finally {
    client.release();
  }
});

app.put('/api/magazines/:magazineId/products/:id', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const product = req.body || {};
  const { id } = req.params;
  const client = await pool.connect();

  try {
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
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Nie udało się zaktualizować produktu' });
  } finally {
    client.release();
  }
});

app.delete('/api/magazines/:magazineId/products/:id', authMiddleware, magazineAccessMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
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
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Healthcheck failed', error);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

app.listen(PORT, () => {
  console.log(`API startuje na porcie ${PORT}`);
});

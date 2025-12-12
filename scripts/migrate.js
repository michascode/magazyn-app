#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const sslEnabled = (process.env.DATABASE_SSL || '').toLowerCase() === 'true' ||
  (connectionString || '').includes('supabase.co');
const connectionHost = (() => {
  try {
    return new URL(connectionString).host;
  } catch (error) {
    return 'nieznany host';
  }
})();

if (!connectionString) {
  console.error('Brak zmiennej środowiskowej DATABASE_URL. Uzupełnij .env i uruchom ponownie.');
  process.exit(1);
}

const DATA_PATH = path.join(__dirname, '..', 'server', 'data', 'db.json');
const DEFAULT_DB = { users: [], magazines: [], memberships: {}, products: {} };

function loadSeedData() {
  if (!fs.existsSync(DATA_PATH)) {
    console.warn(`Plik ${DATA_PATH} nie istnieje – tworzę pusty szablon.`);
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    return { ...DEFAULT_DB };
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  } catch (error) {
    console.warn('Nie udało się wczytać server/data/db.json, używam pustego zestawu danych.');
    return { ...DEFAULT_DB };
  }
}

const jsonDb = loadSeedData();

const client = new Client({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});

function toTimestamp(ms) {
  return new Date(ms || Date.now());
}

async function ensureSchema() {
  const statements = [
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user'
    );`,
    `CREATE TABLE IF NOT EXISTS warehouses (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      owner_id UUID REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS warehouse_memberships (
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, warehouse_id)
    );`,
    `CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      brand TEXT,
      size TEXT,
      condition TEXT,
      drop_tag TEXT,
      price NUMERIC,
      code TEXT,
      a INTEGER,
      b INTEGER,
      c INTEGER,
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS product_images (
      id UUID PRIMARY KEY,
      product_id UUID REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      position INTEGER DEFAULT 0
    );`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ
    );`,
  ];

  for (const statement of statements) {
    await client.query(statement);
  }
}

async function truncateTables() {
  await client.query(
    'TRUNCATE TABLE product_images, products, warehouse_memberships, warehouses, sessions, users RESTART IDENTITY CASCADE;'
  );
}

async function seedUsers() {
  const insertUser = `INSERT INTO users (id, login, password_hash, role)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET login = EXCLUDED.login, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role;`;

  for (const user of jsonDb.users || []) {
    await client.query(insertUser, [user.id, user.username, user.password, 'user']);
  }
}

async function seedWarehouses() {
  const insertWarehouse = `INSERT INTO warehouses (id, name, password_hash, owner_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, owner_id = EXCLUDED.owner_id;`;

  for (const magazine of jsonDb.magazines || []) {
    await client.query(insertWarehouse, [magazine.id, magazine.name, magazine.password, magazine.ownerId]);
  }
}

async function seedMemberships() {
  const insertMembership = `INSERT INTO warehouse_memberships (user_id, warehouse_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING;`;

  const memberships = jsonDb.memberships || {};
  for (const [userId, warehouseIds] of Object.entries(memberships)) {
    for (const warehouseId of warehouseIds) {
      await client.query(insertMembership, [userId, warehouseId]);
    }
  }
}

async function seedProducts() {
  const insertProduct = `INSERT INTO products (
      id, warehouse_id, name, brand, size, condition, drop_tag, price, code, a, b, c, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    ) ON CONFLICT (id) DO UPDATE SET
      warehouse_id = EXCLUDED.warehouse_id,
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      size = EXCLUDED.size,
      condition = EXCLUDED.condition,
      drop_tag = EXCLUDED.drop_tag,
      price = EXCLUDED.price,
      code = EXCLUDED.code,
      a = EXCLUDED.a,
      b = EXCLUDED.b,
      c = EXCLUDED.c,
      created_at = EXCLUDED.created_at;`;

  const insertImage = `INSERT INTO product_images (id, product_id, url, position)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, position = EXCLUDED.position;`;

  const productsByWarehouse = jsonDb.products || {};
  for (const [warehouseId, products] of Object.entries(productsByWarehouse)) {
    for (const product of products) {
      await client.query(insertProduct, [
        product.id,
        warehouseId,
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
        toTimestamp(product.createdAt),
      ]);

      for (const [index, image] of (product.images || []).entries()) {
        await client.query(insertImage, [image.id, product.id, image.url, index]);
      }
    }
  }
}

async function run() {
  console.log(`Łączenie z bazą danych pod ${connectionHost} (SSL: ${sslEnabled ? 'włączone' : 'wyłączone'})...`);
  await client.connect();
  try {
    await client.query('BEGIN');
    await ensureSchema();
    await truncateTables();
    await seedUsers();
    await seedWarehouses();
    await seedMemberships();
    await seedProducts();
    await client.query('COMMIT');
    console.log('Migracja zakończona sukcesem.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migracja nie powiodła się:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();

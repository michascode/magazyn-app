const request = require('supertest');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/magazyn_test';

const { app, pool } = require('../server');

const user = { id: '00000000-0000-0000-0000-000000000001', username: 'tester', password: 'sekret' };
const warehouse = { id: '00000000-0000-0000-0000-000000000010', name: 'Test Magazyn', password: 'magazyn' };

const createStatements = [
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
    main_image_id UUID,
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

async function ensureSchema() {
  for (const statement of createStatements) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query(statement);
  }
}

async function resetDatabase() {
  await pool.query(
    'TRUNCATE TABLE product_images, products, warehouse_memberships, warehouses, sessions, users RESTART IDENTITY CASCADE;'
  );
}

async function seedBasics() {
  const hashedUserPassword = await bcrypt.hash(user.password, 10);
  const hashedWarehousePassword = await bcrypt.hash(warehouse.password, 10);

  await pool.query('INSERT INTO users (id, login, password_hash) VALUES ($1, $2, $3)', [
    user.id,
    user.username,
    hashedUserPassword,
  ]);

  await pool.query('INSERT INTO warehouses (id, name, password_hash, owner_id) VALUES ($1, $2, $3, $4)', [
    warehouse.id,
    warehouse.name,
    hashedWarehousePassword,
    user.id,
  ]);

  await pool.query('INSERT INTO warehouse_memberships (user_id, warehouse_id) VALUES ($1, $2)', [
    user.id,
    warehouse.id,
  ]);
}

async function authToken() {
  const response = await request(app).post('/api/auth/login').send({
    username: user.username,
    password: user.password,
  });

  return response.body.token;
}

describe('API integration (Postgres)', () => {
  beforeAll(async () => {
    await ensureSchema();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedBasics();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('logs in a user and returns a JWT token', async () => {
    const response = await request(app).post('/api/auth/login').send({
      username: user.username,
      password: user.password,
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user).toMatchObject({ id: user.id, username: user.username });
  });

  it('creates, retrieves, updates and deletes a product', async () => {
    const token = await authToken();

    const created = await request(app)
      .post(`/api/magazines/${warehouse.id}/products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nowy produkt', price: 55.5, code: 'SKU-1' });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Nowy produkt', price: '55.5' });

    const productId = created.body.id;

    const fetched = await request(app)
      .get(`/api/magazines/${warehouse.id}/products`)
      .set('Authorization', `Bearer ${token}`);

    expect(fetched.status).toBe(200);
    expect(fetched.body.items.some((item) => item.id === productId)).toBe(true);

    const updated = await request(app)
      .put(`/api/magazines/${warehouse.id}/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Zaktualizowany' });

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Zaktualizowany');

    const removed = await request(app)
      .delete(`/api/magazines/${warehouse.id}/products/${productId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(removed.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/api/magazines/${warehouse.id}/products`)
      .set('Authorization', `Bearer ${token}`);

    expect(afterDelete.body.items.some((item) => item.id === productId)).toBe(false);
  });

  it('paginates product list', async () => {
    const token = await authToken();

    for (let index = 0; index < 25; index += 1) {
      const name = `Produkt ${index + 1}`;
      const createdAt = new Date(Date.now() - index * 1000);

      await pool.query(
        `INSERT INTO products (id, warehouse_id, name, price, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [warehouse.id, name, index, createdAt]
      );
    }

    const response = await request(app)
      .get(`/api/magazines/${warehouse.id}/products?page=2&pageSize=10`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(2);
    expect(response.body.pageSize).toBe(10);
    expect(response.body.total).toBe(25);
    expect(response.body.items).toHaveLength(10);
  });
});

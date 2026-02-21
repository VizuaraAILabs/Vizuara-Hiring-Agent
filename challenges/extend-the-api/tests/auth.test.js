const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

// Reset database before each test
beforeEach(() => {
  db.users.length = 0;
  db.posts.length = 0;
});

describe('Auth', () => {
  describe('POST /auth/register', () => {
    test('registers a new user', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('test@example.com');
      expect(res.body.token).toBeDefined();
    });

    test('rejects duplicate email', async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });

      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password456', name: 'Another User' });

      expect(res.status).toBe(409);
    });

    test('rejects missing fields', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });
    });

    test('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    test('rejects invalid password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });
});

describe('Users', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });
    token = res.body.token;
  });

  test('GET /users returns user list', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe('test@example.com');
  });

  test('GET /users/me requires authentication', async () => {
    const res = await request(app).get('/users/me');
    expect(res.status).toBe(401);
  });

  test('GET /users/me returns current user', async () => {
    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@example.com');
  });
});

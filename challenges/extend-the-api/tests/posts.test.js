const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

// Reset database before each test
beforeEach(() => {
  db.users.length = 0;
  db.posts.length = 0;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function registerAndLogin(email = 'alice@example.com') {
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password: 'password123', name: 'Alice' });
  return { token: res.body.token, userId: res.body.user.id };
}

async function createPost(token, title = 'Hello World', body = 'Post body content.') {
  const res = await request(app)
    .post('/posts')
    .set('Authorization', `Bearer ${token}`)
    .send({ title, body });
  return res;
}

// ─── POST /posts ─────────────────────────────────────────────────────────────

describe('POST /posts', () => {
  test('creates a post when authenticated', async () => {
    const { token, userId } = await registerAndLogin();
    const res = await createPost(token);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Hello World');
    expect(res.body.body).toBe('Post body content.');
    expect(res.body.authorId).toBe(userId);
    expect(res.body.createdAt).toBeDefined();
  });

  test('stores the post in db.posts', async () => {
    const { token } = await registerAndLogin();
    await createPost(token, 'Stored Post', 'Content');

    expect(db.posts).toHaveLength(1);
    expect(db.posts[0].title).toBe('Stored Post');
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/posts')
      .send({ title: 'Anon post', body: 'Content' });

    expect(res.status).toBe(401);
  });

  test('returns 400 when title is missing', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'No title here' });

    expect(res.status).toBe(400);
  });

  test('returns 400 when body is missing', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'No body here' });

    expect(res.status).toBe(400);
  });
});

// ─── GET /posts ───────────────────────────────────────────────────────────────

describe('GET /posts', () => {
  beforeEach(async () => {
    const { token } = await registerAndLogin();
    await createPost(token, 'Post One', 'Content one');
    await createPost(token, 'Post Two', 'Content two');
    await createPost(token, 'Post Three', 'Content three');
  });

  test('returns all posts with pagination metadata', async () => {
    const res = await request(app).get('/posts');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(3);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBeDefined();
  });

  test('supports page and limit query params', async () => {
    const res = await request(app).get('/posts?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
  });

  test('returns the correct page of results', async () => {
    const res = await request(app).get('/posts?page=2&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.page).toBe(2);
  });

  test('returns empty array when no posts exist', async () => {
    db.posts.length = 0;
    const res = await request(app).get('/posts');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

// ─── GET /posts/:id ───────────────────────────────────────────────────────────

describe('GET /posts/:id', () => {
  let postId;

  beforeEach(async () => {
    const { token } = await registerAndLogin();
    const res = await createPost(token, 'Specific Post', 'Some content');
    postId = res.body.id;
  });

  test('returns the post by ID', async () => {
    const res = await request(app).get(`/posts/${postId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(postId);
    expect(res.body.title).toBe('Specific Post');
  });

  test('returns 404 for a non-existent post ID', async () => {
    const res = await request(app).get('/posts/nonexistent-id-000');

    expect(res.status).toBe(404);
  });
});

// ─── DELETE /posts/:id ────────────────────────────────────────────────────────

describe('DELETE /posts/:id', () => {
  let token;
  let postId;

  beforeEach(async () => {
    ({ token } = await registerAndLogin());
    const res = await createPost(token, 'To Delete', 'Will be gone');
    postId = res.body.id;
  });

  test('deletes own post and returns 204', async () => {
    const res = await request(app)
      .delete(`/posts/${postId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(db.posts.find((p) => p.id === postId)).toBeUndefined();
  });

  test('returns 403 when deleting another user\'s post', async () => {
    const { token: otherToken } = await registerAndLogin('bob@example.com');

    const res = await request(app)
      .delete(`/posts/${postId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
    expect(db.posts).toHaveLength(1); // post was NOT deleted
  });

  test('returns 401 when not authenticated', async () => {
    const res = await request(app).delete(`/posts/${postId}`);

    expect(res.status).toBe(401);
  });

  test('returns 404 for a non-existent post ID', async () => {
    const res = await request(app)
      .delete('/posts/nonexistent-id-000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

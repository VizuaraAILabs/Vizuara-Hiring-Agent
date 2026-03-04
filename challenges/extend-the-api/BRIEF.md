# Extend a REST API

## Using Claude Code

Open your terminal and type `claude` to launch your AI assistant. Use it to read and understand the existing codebase, plan what you need to build, generate implementation code, and iterate on test failures. Pay attention to the patterns already established in the codebase — your additions should feel consistent with the existing style.

## The Situation

You've joined a small team building a blog platform. The authentication layer and basic user management are already complete and fully tested. Your task is to implement the **Posts** feature, extending the existing API with new endpoints.

## What Already Exists

Run `npm install && npm test` to confirm the baseline — existing tests pass, posts tests fail.

```
GET    /health          — health check
POST   /auth/register   — register a new user (returns JWT)
POST   /auth/login      — log in (returns JWT)
GET    /users           — list all users (public)
GET    /users/me        — current user profile (requires auth)
```

The JWT `authenticate` middleware is in `src/middleware/auth.js`. The in-memory data store is in `src/db.js` — it already has a `posts` array waiting.

## Requirements

Implement the following four endpoints in `src/routes/posts.js`:

### 1. `POST /posts` — Create a post
- Requires authentication (JWT Bearer token)
- Request body: `{ "title": "string", "body": "string" }`
- Returns `201` with the created post: `{ id, title, body, authorId, createdAt }`
- Returns `400` if `title` or `body` is missing
- Returns `401` if not authenticated

### 2. `GET /posts` — List all posts
- Public (no auth required)
- Supports optional pagination via query params: `?page=1&limit=10`
- Default: page `1`, limit `10`
- Returns `200` with: `{ posts: [...], total: number, page: number, limit: number }`

### 3. `GET /posts/:id` — Get a single post
- Public
- Returns `200` with the post object
- Returns `404` if the post doesn't exist

### 4. `DELETE /posts/:id` — Delete a post
- Requires authentication
- Only the post's author may delete it
- Returns `204` (no body) on success
- Returns `403` if the authenticated user is not the author
- Returns `404` if the post doesn't exist

## Getting Started

```bash
npm install
npm test
```

The existing auth tests should pass. The posts tests will all fail until you implement the endpoints.

## Deliverables

1. All tests in `tests/posts.test.js` pass
2. All tests in `tests/auth.test.js` continue to pass
3. Posts are stored in `db.posts` (the in-memory array in `src/db.js`)

## Notes

- Post IDs should be UUIDs — the `uuid` package is already a dependency
- You will need to mount your router in `src/server.js` — look at how `/auth` and `/users` are registered
- The stub in `src/routes/posts.js` is a starting point; the TODO comments describe each endpoint's contract

## What's Being Evaluated

- Whether your implementation matches the contract defined by the tests
- How you navigate and understand an unfamiliar codebase before adding to it
- The quality and consistency of your code with the existing patterns
- How you use the AI to plan, implement, and debug iteratively

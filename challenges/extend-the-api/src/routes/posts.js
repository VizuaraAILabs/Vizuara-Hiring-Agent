const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /posts — create a new post (requires authentication)
// Body: { title: string, body: string }
// Returns 201 with { id, title, body, authorId, createdAt }
// Returns 400 if title or body is missing
router.post('/', authenticate, (req, res) => {
  // TODO: validate that title and body are present in req.body
  // TODO: create a post object with a uuid, the author's id from req.user, and a createdAt timestamp
  // TODO: push it to db.posts and return it with status 201
  res.status(501).json({ error: 'Not implemented' });
});

// GET /posts — list all posts with pagination (public)
// Query params: ?page=1&limit=10  (both optional, defaults shown)
// Returns { posts: [...], total: number, page: number, limit: number }
router.get('/', (req, res) => {
  // TODO: parse page and limit from req.query (use parseInt, default page=1, limit=10)
  // TODO: slice db.posts to return the correct page
  // TODO: return { posts, total: db.posts.length, page, limit }
  res.status(501).json({ error: 'Not implemented' });
});

// GET /posts/:id — get a single post by ID (public)
// Returns 200 with post object, or 404 if not found
router.get('/:id', (req, res) => {
  // TODO: find the post in db.posts by req.params.id
  // TODO: return 404 if not found, otherwise return the post
  res.status(501).json({ error: 'Not implemented' });
});

// DELETE /posts/:id — delete a post (requires authentication, owner only)
// Returns 204 on success, 403 if not the author, 404 if not found
router.delete('/:id', authenticate, (req, res) => {
  // TODO: find the post in db.posts by req.params.id — return 404 if not found
  // TODO: check that req.user.id === post.authorId — return 403 if not
  // TODO: remove the post from db.posts and return 204
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;

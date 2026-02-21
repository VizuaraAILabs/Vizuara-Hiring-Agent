const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /users — list all users (public profiles)
router.get('/', (req, res) => {
  const users = db.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.createdAt,
  }));
  res.json(users);
});

// GET /users/me — get current user profile
router.get('/me', authenticate, (req, res) => {
  const user = db.users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ id: user.id, email: user.email, name: user.name, createdAt: user.createdAt });
});

module.exports = router;

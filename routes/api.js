const express = require('express')
const router = express.Router()
const db = require('../models/db')

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

router.get('/posts', requireAuth, (req, res) => {
  const { status = 'all', limit = 20 } = req.query
  let query = 'SELECT id, title, excerpt, status, created_at, updated_at FROM posts WHERE user_id = ?'
  const params = [req.session.user.id]
  if (status !== 'all') { query += ' AND status = ?'; params.push(status) }
  query += ' ORDER BY updated_at DESC LIMIT ?'
  params.push(parseInt(limit))
  res.json(db.prepare(query).all(...params))
})

router.get('/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id)
  if (!post) return res.status(404).json({ error: 'Not found' })
  res.json(post)
})

router.post('/posts', requireAuth, (req, res) => {
  const { title, content, excerpt, status = 'draft', featured_image } = req.body
  if (!title || !content) return res.status(400).json({ error: 'title and content are required' })
  const result = db.prepare(
    'INSERT INTO posts (user_id, title, content, excerpt, featured_image, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.session.user.id, title, content, excerpt || null, featured_image || null, status)
  res.json({ id: result.lastInsertRowid, status })
})

router.put('/posts/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id)
  if (!post) return res.status(404).json({ error: 'Not found' })
  const updated = {
    title: req.body.title ?? post.title,
    content: req.body.content ?? post.content,
    excerpt: req.body.excerpt !== undefined ? req.body.excerpt : post.excerpt,
    featured_image: req.body.featured_image !== undefined ? req.body.featured_image : post.featured_image,
    status: req.body.status ?? post.status,
  }
  db.prepare(
    'UPDATE posts SET title = ?, content = ?, excerpt = ?, featured_image = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).run(updated.title, updated.content, updated.excerpt, updated.featured_image, updated.status, req.params.id, req.session.user.id)
  res.json({ success: true })
})

router.delete('/posts/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').run(req.params.id, req.session.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
  res.json({ success: true })
})

router.get('/search', requireAuth, (req, res) => {
  const q = `%${req.query.q || ''}%`
  const { status = 'all' } = req.query
  let query = 'SELECT id, title, excerpt, status, created_at FROM posts WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR excerpt LIKE ?)'
  const params = [req.session.user.id, q, q, q]
  if (status !== 'all') { query += ' AND status = ?'; params.push(status) }
  query += ' ORDER BY updated_at DESC LIMIT 20'
  res.json(db.prepare(query).all(...params))
})

module.exports = router

const express = require('express')
const router = express.Router()
const db = require('../models/db')
const { marked } = require('marked')

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login')
  next()
}

router.get('/', (req, res) => {
  const posts = db.prepare(`
    SELECT posts.*, users.username
    FROM posts
    JOIN users ON posts.user_id = users.id
    WHERE posts.status = 'published'
    ORDER BY created_at DESC
  `).all()
  res.render('layouts/main', { body: 'index', posts, title: 'All Posts' })
})

router.get('/new', requireAuth, (req, res) => {
  res.render('layouts/main', { body: 'posts/new' })
})

router.post('/', requireAuth, (req, res) => {
  const { title, content, excerpt, featured_image, status } = req.body
  db.prepare(`
    INSERT INTO posts (user_id, title, content, excerpt, featured_image, status) 
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.session.user.id, title, content, excerpt || null, featured_image || null, status || 'draft')
  
  res.redirect('/')
})

router.get('/:id/edit', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (!post || post.user_id !== req.session.user.id) return res.redirect('/')
  res.render('layouts/main', { body: 'posts/edit', post })
})

router.put('/:id', requireAuth, (req, res) => {
  const { title, content, excerpt, featured_image, status } = req.body
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  
  if (!post || post.user_id !== req.session.user.id) return res.redirect('/')
  
  db.prepare(`
    UPDATE posts SET title = ?, content = ?, excerpt = ?, featured_image = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(title, content, excerpt || null, featured_image || null, status || 'draft', req.params.id)
  
  res.redirect('/')
})

router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id)
  if (post && post.user_id === req.session.user.id) {
    db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id)
  }
  res.redirect('/')
})

router.get('/:id', (req, res) => {
  const post = db.prepare(`
    SELECT posts.*, users.username 
    FROM posts 
    JOIN users ON posts.user_id = users.id 
    WHERE posts.id = ?
  `).get(req.params.id)
  
  if (!post) return res.redirect('/')
  post.contentHtml = marked.parse(post.content || '')
  res.render('layouts/main', { body: 'posts/show', post })
})

module.exports = router

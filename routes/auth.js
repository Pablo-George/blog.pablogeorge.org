const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const db = require('../models/db')

router.get('/login', (req, res) => {
  res.render('layouts/main', { body: 'auth/login' })
})

router.get('/register', (req, res) => {
  res.render('layouts/main', { body: 'auth/register' })
})

router.post('/register', (req, res) => {
  const { username, email, password } = req.body
  const hashedPassword = bcrypt.hashSync(password, 10)
  
  try {
    db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
      .run(username, email, hashedPassword)
    res.redirect('/login')
  } catch (err) {
    res.render('layouts/main', { body: 'auth/register', error: 'Username or email already exists' })
  }
})

router.post('/login', (req, res) => {
  const { username, password } = req.body
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = { id: user.id, username: user.username }
    res.redirect('/')
  } else {
    res.render('layouts/main', { body: 'auth/login', error: 'Invalid credentials' })
  }
})

router.post('/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/')
})

module.exports = router

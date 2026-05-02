require('dotenv').config()
const express = require('express')
const session = require('express-session')
const methodOverride = require('method-override')
const bcrypt = require('bcrypt')
const path = require('path')
const db = require('./models/db')

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(methodOverride('_method'))
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}))

app.use((req, res, next) => {
  res.locals.user = req.session.user || null
  next()
})

const authRoutes = require('./routes/auth')
const postRoutes = require('./routes/posts')

app.use('/', authRoutes)
app.use('/posts', postRoutes)

app.get('/', (req, res) => {
  const posts = db.prepare(`
    SELECT posts.*, users.username 
    FROM posts 
    JOIN users ON posts.user_id = users.id 
    WHERE posts.status = 'published' 
    ORDER BY created_at DESC
  `).all()
  res.render('layouts/main', { body: 'index', posts })
})

const PORT = process.env.PORT || 3000

if (require.main === module) {
  app.listen(PORT, () => console.log(`Blog running on http://localhost:${PORT}`))
}

module.exports = app

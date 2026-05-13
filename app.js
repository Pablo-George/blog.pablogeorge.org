require('dotenv').config()
const express = require('express')
const session = require('express-session')
const methodOverride = require('method-override')
const path = require('path')
const multer = require('multer')
const db = require('./models/db')

const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, 'public/uploads')

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'))
    cb(null, true)
  }
})

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.static('public'))
app.use('/uploads', express.static(uploadsDir))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(methodOverride('_method'))
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}))

const { version } = require('./package.json')

app.use((req, res, next) => {
  res.locals.user = req.session.user || null
  res.locals.flash = req.session.flash || null
  res.locals.query = ''
  res.locals.cssVersion = version
  delete req.session.flash
  next()
})

const authRoutes = require('./routes/auth')
const postRoutes = require('./routes/posts')
const apiRoutes = require('./routes/api')

app.use('/', authRoutes)
app.use('/posts', postRoutes)
app.use('/api', apiRoutes)

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

app.post('/upload', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' })

  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })

    const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg'
    const newName = req.file.filename + ext
    const fs = require('fs')
    fs.renameSync(req.file.path, path.join(uploadsDir, newName))

    res.json({ url: `/uploads/${newName}` })
  })
})

app.get('/about', (req, res) => {
  res.render('layouts/main', { body: 'about', title: 'About' })
})

app.get('/contact', (req, res) => {
  res.render('layouts/main', { body: 'contact', title: 'Contact' })
})

app.post('/contact', (req, res) => {
  const { name, email, message } = req.body
  console.log(`[contact] from=${name} <${email}>: ${message}`)
  req.session.flash = { type: 'success', message: `Thanks ${name}! Your message has been received.` }
  res.redirect('/contact')
})

app.get('/search', (req, res) => {
  const q = (req.query.q || '').trim()
  const results = q
    ? db.prepare(`
        SELECT posts.*, users.username
        FROM posts
        JOIN users ON posts.user_id = users.id
        WHERE posts.status = 'published'
          AND (posts.title LIKE ? OR posts.content LIKE ? OR posts.excerpt LIKE ?)
        ORDER BY created_at DESC
      `).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : []
  res.render('layouts/main', { body: 'search', title: 'Search', results, query: q })
})

app.post('/subscribe', (req, res) => {
  const { email } = req.body
  console.log(`[subscribe] ${email}`)
  const referer = req.get('Referer') || '/'
  req.session.flash = { type: 'success', message: `You're subscribed! We'll send new posts to ${email}.` }
  res.redirect(referer)
})

const PORT = process.env.PORT || 3001

if (require.main === module) {
  app.listen(PORT, () => console.log(`Blog running on http://localhost:${PORT}`))
}

module.exports = app

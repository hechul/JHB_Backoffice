const express = require('express')
const { startWorker } = require('./lib/job-worker')
const pingRouter = require('./routes/ping')

const app = express()
const PORT = process.env.PORT || 3001

// 미들웨어
app.use(express.json())

// 요청 로깅
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
    next()
})

// 라우트
app.use('/ping', pingRouter)

// 기본 루트
app.get('/', (req, res) => {
    res.json({ service: 'JHB Blog Crawler', status: 'running' })
})

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'not found' })
})

// 서버 시작
app.listen(PORT, () => {
    console.log(`[server] 크롤러 서버 시작 port=${PORT}`)
    // DB 폴링 워커 시작
    startWorker()
})

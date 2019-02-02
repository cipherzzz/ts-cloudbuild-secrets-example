import express from 'express'
import createLogger from './logger'
import { getTestPayload, checkSecret } from './logic'

const logger = createLogger('app')

export function start() {
    const app = express()
    const port = process.env.PORT || 8080
    app.listen(port, () => {
        logger.info('Server running on port ', port)
    })

    app.get('/', (req, res, next) => {
        res.json(getTestPayload())
    })

    app.get('/secret', (req, res, next) => {
        res.json(checkSecret())
    })
}

start()

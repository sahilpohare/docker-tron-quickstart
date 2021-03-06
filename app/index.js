const express = require('express')
const proxy = require('http-proxy-middleware')
const morgan = require('morgan')
const chalk = require('chalk')
const _ = require('lodash')
const config = require('./src/config')
const bodyParser = require('body-parser')

const admin = require('./src/routes/admin')

process.on('uncaughtException', function (error) {
  console.error(error.message)
})

const only = () => {
  return function (tokens, req, res) {
    const status = tokens.status(req, res)
    const color = status < 400 ? 'green' : 'red'
    return chalk[color]([' ',
      tokens.method(req, res),
      tokens.url(req, res),
      status,
      tokens.res(req, res, 'content-length'), '-',
      tokens['response-time'](req, res), 'ms'
    ].join(' '))
  }
}

const setHeaders = (who) => {

  return function onProxyRes(proxyRes, req, res) {

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Accept')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')

    const env = config.getEnv()

    if (env.verbose) {
      const oldWrite = res.write,
          oldEnd = res.end

      const chunks = []

      res.write = function (chunk) {
        chunks.push(new Buffer(chunk))

        oldWrite.apply(res, arguments)
      }

      res.end = function (chunk) {
        if (chunk)
          chunks.push(new Buffer(chunk))

        let body = Buffer.concat(chunks).toString('utf8')
        console.log('\n\n', chalk.cyan(`(${who})`), chalk.bold(req.path), '\n', body.replace(/\n+$/, ''))

        oldEnd.apply(res, arguments)
      }
    }
  }
}

function onProxyReq(proxyReq, req, res) {
  const env = config.getEnv()

  if (env.verbose && env.showQueryString && _.keys(req.query).length) {
    console.log(chalk.gray(' QueryString:'),chalk.cyan(JSON.stringify(req.query)))
  }

  if (env.verbose && env.showBody && req.method == "POST" && _.keys(req.body).length) {
    let bodyData = JSON.stringify(req.body)
    console.log(chalk.gray(' Body:'), chalk.cyan(bodyData))
    proxyReq.setHeader('Content-Type', 'application/json')
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
    proxyReq.write(bodyData)
  }
}

function onError(err, req, res) {
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  })
  res.end(err)
}

const setApp = (name, port0, port) => {
  const app = express()
  app.use(morgan(only()))
  app.use(bodyParser.json())
  app.use('/favicon.ico', function (req, res) {
    res.send('')
  })
  if (name === 'full-node') {
    app.use('/admin', admin)
  }
  app.use('/', proxy({
    changeOrigin: true,
    onProxyReq,
    onProxyRes: setHeaders(name),
    onError,
    target: `http://127.0.0.1:${port0}`
  }))
  app.listen(port)

}


setApp('full-node', 18190, 8090)
setApp('solidity-node', 18191, 8091)
setApp('event-server', 18891, 8092)

const n = "\n"

console.log(n, 'Full Node listening on', chalk.bold('http://127.0.0.1:8090'),
    n, 'Solidity Node listening on', chalk.bold('http://127.0.0.1:8091'),
    n, 'Event Server listening on', chalk.bold('http://127.0.0.1:8092'), n)


const Koa = require('koa')
const koaStatic = require('koa-static')
const IlpNode = require('../../src/index')
const ilpNode = {}

function startServer(port) {
  const statsFile = `./data${port}/stats.json`
  const credsFile = `./data${port}/creds.json`
  const publicFolder = `./data${port}/statics/`
  const hostname = `localhost:${port}`
  const probeInterval = 10000
  
  ilpNode[port] = new IlpNode(statsFile, credsFile, hostname)
  
  const app = new Koa()
  app.use(async function(ctx, next) {
    console.log(ctx.path)
    switch(ctx.path) {
    case '/.well-known/webfinger': ctx.body = await ilpNode[port].handleWebFinger(ctx.query.resource)
      break
    case '/api/peers/rpc': ctx.body = await ilpNode[port].handleRpc(ctx.query, ctx.body)
      break
    case '/spsp': ctx.body = await ilpNode[port].handleSpsp()
      break
    case '/stats':
      if (typeof ctx.query.test === 'string') {
        await ilpNode[port].testHost(ctx.query.test)
      }
      ctx.body = ilpNode[port].stats
      break
    default:
      return next()
    }
    ctx.type = 'json'
    console.log('rendered', ctx.path, ctx.query, ctx.body)
  })
  app.use(koaStatic(publicFolder))
  app.listen(port)
  
  setInterval(() => {
    ilpNode[port].testAll()
  }, probeInterval)
}

startServer(8001)
startServer(8002)
setTimeout(() => {
  ilpNode[8001].testHost('localhost:8002')
  ilpNode[8002].testHost('localhost:8001')
}, 100)

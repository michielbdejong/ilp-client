const Koa = require('koa')
const koaStatic = require('koa-static')
const IlpNode = require('../../src/index')

function startServer(port) {
  const statsFile = `./data${port}/stats.json`
  const credsFile = `./data${port}/creds.json`
  const publicFolder = `./data${port}/statics/`
  const hostname = `localhost:${port}`
  const probeInterval = 10000
  
  const ilpNode = new IlpNode(statsFile, credsFile, hostname)
  
  const app = new Koa()
  app.use(async function(ctx, next) {
    console.log(ctx.path)
    switch(ctx.path) {
    case '/.well-known/webfinger': ctx.body = await ilpNode.handleWebFinger(ctx.query.resource)
      break
    case '/rpc': ctx.body = await ilpNode.handleRpc(ctx.query, ctx.body)
      break
    case '/spsp': ctx.body = await ilpNode.handleSpsp()
      break
    case '/stats':
      if (typeof ctx.query.test === 'string') {
        await ilpNode.testHost(ctx.query.test)
      }
      ctx.body = ilpNode.stats
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
    ilpNode.testAll()
  }, probeInterval)
}

startServer(8001)
startServer(8002)

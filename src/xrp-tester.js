console.log('Instantiating xrp tester',
  process.env.PLUGIN,
  process.env.XRP_SECRET,
  process.env.XRP_SERVER,
  process.env.CONNECTOR
)
const pay = require('./test-payment')
const Plugin = require(process.env.PLUGIN)

const prefix = 'test.crypto.xrp.'
const plugin = new Plugin({
  secret: process.env.XRP_SECRET,
  server: process.env.XRP_SERVER,
  prefix
})

// pay to self:
pay(plugin, plugin, process.env.CONNECTOR)

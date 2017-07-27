console.log('Instantiating xrp tester',
  process.env.PROVIDER,
  process.env.ADDRESS,
  process.env.SECRET,
  process.env.CONNECTOR
)
const pay = require('./test-payment')
const Plugin = require('ilp-plugin-ethereum')

const prefix = 'test.crypto.eth.rinkeby.'
const plugin = new Plugin({
  provider: process.env.PROVIDER,
  address: process.env.ADDRESS,
  secret: process.env.SECRET,
  prefix
})

// pay to self:
pay(plugin, plugin, process.env.CONNECTOR)

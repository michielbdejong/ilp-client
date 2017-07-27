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
  contract: '0x8b3fbd781096b51e68448c6e5b53b240f663199f',
  prefix
})

// pay to self:
pay(plugin, plugin, process.env.CONNECTOR)

console.log('Instantiating xrp tester',
  process.env.PROVIDER,
  process.env.ADDRESS1,
  process.env.SECRET1,
  process.env.ADDRESS2,
  process.env.SECRET2,
  process.env.CONNECTOR
)
const pay = require('./test-payment')
const Plugin = require('ilp-plugin-ethereum')

const prefix = 'test.crypto.eth.rinkeby.'
const plugin1 = new Plugin({
  provider: process.env.PROVIDER,
  address: process.env.ADDRESS1,
  secret: process.env.SECRET1,
  contract: '0x8B3FBD781096B51E68448C6E5B53B240F663199F',
  prefix
})
const plugin2 = new Plugin({
  provider: process.env.PROVIDER,
  address: process.env.ADDRESS2,
  secret: process.env.SECRET2,
  contract: '0x8B3FBD781096B51E68448C6E5B53B240F663199F',
  prefix
})

// pay from wallet 1 to wallet 2:
pay(plugin1, plugin2, process.env.CONNECTOR)

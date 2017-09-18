const IlpNode = require('./index')

const config = {
  btp: {
    listen: process.env.PORT || 8000,
    initialBalancePerPeer: 10000
  },
  xrp: {
    secret: process.env.XRP_SECRET || 'shvKKDpRGMyKMUVn4EyMqCh9BQoP9',
    address: process.env.XRP_ADDRESS || 'rhjRdyVNcaTNLXp3rkK4KtjCdUd9YEgrPs',
    server: process.env.XRP_SERVER || 'wss://s.altnet.rippletest.net:51233',
    prefix: process.env.XRP_PREFIX || 'test.crypto.xrp.'
  }
}

// ...
const ilpNode = new IlpNode(config)
console.log('starting...', config)
ilpNode.start().then(() => {
  console.log('started!')
})

const Connector = require('./connector')

const connector = new Connector('peer.testing.', {
  xrp: {
    secret: process.env.XRP_SECRET || 'shvKKDpRGMyKMUVn4EyMqCh9BQoP9',
    address: process.env.XRP_ADDRESS || 'rhjRdyVNcaTNLXp3rkK4KtjCdUd9YEgrPs',
    server: process.env.XRP_SERVER || 'wss://s.altnet.rippletest.net:51233',
    prefix: process.env.XRP_PREFIX || 'test.crypto.xrp.'
  }
})

// ...
const port = process.env.PORT || 8000
connector.open(port, 10000)
console.log(`Listening on ws://localhost:${port}/`)

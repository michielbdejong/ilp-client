const Connector = require('./connector')

const connector = new Connector('peer.testing.', {
  xrp: {
    secret: 'shRm6dnkLMzTxBUMgCy6bB6jweS3X',
    server: 'wss://s.altnet.rippletest.net:51233',
    prefix: 'test.crypto.xrp.'
  },
  dummy: {
    prefix: 'test.crypto.eth.rinkeby.'
  }
})

// ...
connector.open(8000, 1000000)
console.log('Listening on ws://localhost:8000/')

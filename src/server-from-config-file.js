const Connector = require('./connector')

const connector = new Connector('peer.testing.', {
  xrp: require('../config/xrp.js')[0],
  dummy: {
    prefix: 'test.crypto.eth.rinkeby.'
  }
})

// ...
connector.open(8000, 1000000)
console.log('Listening on ws://localhost:8000/')

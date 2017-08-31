const Connector = require('./connector')
function Server(port) {
  this.connector = new Connector('peer.testing.', {
    xrp: {
      secret: 'shRm6dnkLMzTxBUMgCy6bB6jweS3X',
      server: 'wss://s.altnet.rippletest.net:51233',
      prefix: 'test.crypto.xrp.'
    },
    dummy: {
      prefix: 'test.crypto.eth.rinkeby.'
    }
  })
  this.connector.open(port)
}

//...
const server = new Server(8000)

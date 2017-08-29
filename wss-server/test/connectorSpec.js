const Connector = require('../connector')
const Peer = require('../peer')
const Quoter = require('../quoter')
const Forwarder = require('../forwarder')
const IlpPacket = require('ilp-packet')

const assert = require('chai').assert
const WebSocket = require('ws');

function Client() {
}

Client.prototype = {
  open(url) {
    const name = url
    return new Promise(resolve => {
      this.ws = new WebSocket(url, {
        perMessageDeflate: false
      })
      this.ws.on('open', () => {
        console.log('ws open')
        this.quoter = new Quoter()
        this.peers = {}
        this.forwarder = new Forwarder(this.quoter, this.peers)
        console.log('creating client peer')
        this.peer = new Peer(name, 0, this.ws, this.quoter, this.forwarder)
        resolve()
      })
    })
  },

  close() {
    return new Promise(resolve => {
      this.ws.on('close', resolve)
      this.ws.close()
    })
  }
}

describe('Connector', () => {
  beforeEach(function () {
    this.connector = new Connector()
    return this.connector.open(8000)
  })
  afterEach(function () {
    return this.connector.close()
  })

  describe('two clients', () => {
    beforeEach(function () {
      this.client1 = new Client()
      this.client2 = new Client()
      // return this.client1.open('ws://localhost:8000/path')
      return Promise.all([ this.client1.open('ws://localhost:8000/path'), this.client2.open('ws://localhost:8000/path') ])
    })
    afterEach(function () {
      // return this.client1.close()
      return Promise.all([ this.client1.close(), this.client2.close() ])
    })
    it('should respond to quote', function () {
      console.log('in the test!')
      const packet = IlpPacket.serializeIlqpLiquidityRequest({
        destinationAccount: 'example.nexus.bob',
        destinationHoldDuration: 3000
      })
      return this.client1.peer.unpaid('ilp', packet)
    })
  })
})

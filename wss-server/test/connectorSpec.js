const Connector = require('../connector')
const Peer = require('../peer')
const Quoter = require('../peer')
const Forwarder = require('../peer')

const assert = require('chai').assert
const WebSocket = require('ws');

describe('Connector', () => {
  beforeEach(function () {
    this.connector = new Connector(8000)
    return this.connector.open()
  })
  afterEach(function () {
    return this.connector.close()
  })

  describe('two clients', () => {
    beforeEach(function (done) {
      let doneOne = false
      this.ws1 = new WebSocket('ws://localhost:8000/path', {
        perMessageDeflate: false
      })
      this.ws1.on('open', function open() {
        console.log('ws1 open')
        this.quoter1 = new Quoter()
        this.peers1 = {}
        this.forwarder1 = new Forwarder(this.quoter1, this.peers1)
        console.log('creating client peer')
        this.peer1 = new Peer('peer1', 0, this.ws1, this.quoter1, this.forwarder1)
        if (doneOne) { done() } else { doneOne = true }
      })
      this.ws2 = new WebSocket('ws://localhost:8000/path', {
        perMessageDeflate: false
      })
      this.ws2.on('open', function open() {
        this.quoter2 = new Quoter()
        this.peers2 = {}
        this.forwarder2 = new Forwarder(this.quoter2, this.peers2)
        this.peer2 = new Peer('peer2', 0, this.ws2, this.quoter2, this.forwarder2)
        if (doneOne) { done() } else { doneOne = true }
      })
    })
    afterEach(function () {
      this.client1.close()
      this.client2.close()
    })
    it('should respond to quote', function () {
      return this.peer1.unpaid('ilp', IlpPacket.serializeIlqpLiquidityRequest({
        destinationAccount: 'example.nexus.bob',
        destinationHoldDuration: 3000
      })).then(result => {
        console.log(result)
      })
    })
  })
})

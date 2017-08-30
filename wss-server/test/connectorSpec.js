const Connector = require('../connector')
const Peer = require('../peer')
const Quoter = require('../quoter')
const Forwarder = require('../forwarder')
const IlpPacket = require('ilp-packet')

const assert = require('chai').assert
const WebSocket = require('ws');
const crypto = require('crypto')

function Client() {
  this.name = crypto.randomBytes(16).toString('hex')
  this.token = crypto.randomBytes(16).toString('hex')
  this.fulfillments = {}
}

Client.prototype = {
  open(url) {
    return new Promise(resolve => {
      this.ws = new WebSocket(url + this.name + '/' + this.token, {
        perMessageDeflate: false
      })
      this.ws.on('open', () => {
        // console.log('ws open')
        this.quoter = new Quoter()
        this.peers = {}
        this.forwarder = new Forwarder(this.quoter, this.peers)
        // console.log('creating client peer')
        this.peer = new Peer('client-peer.', this.name, 10000, this.ws, this.quoter, this.forwarder, (condition) => {
          // console.log('fulfilling!', condition.toString('hex'), this.fulfillments)
          return this.fulfillments[condition.toString('hex')]
        })
        resolve()
      })
    })
  },

  close() {
    return new Promise(resolve => {
      this.ws.on('close', () => {
        // console.log('close emitted!')
        resolve()
      })
      // console.log('closing client!')
      this.ws.close()
      // console.log('started closing client!')
    })
  }
}

describe('Connector', () => {
  beforeEach(function () {
    this.connector = new Connector('peer.testing.')
    return this.connector.open(8000)
  })
  afterEach(function () {
    return this.connector.close()
  })

  describe('two clients', () => {
    beforeEach(function () {
      this.client1 = new Client()
      this.client2 = new Client()
      // return this.client1.open('ws://localhost:8000/')
      return Promise.all([ this.client1.open('ws://localhost:8000/'), this.client2.open('ws://localhost:8000/') ])
    })
    afterEach(function () {
      // return this.client1.close()
      return Promise.all([ this.client1.close(), this.client2.close() ])
    })

    it('should respond to quote', function () {
      // console.log('in the test!')
      const packet = IlpPacket.serializeIlqpLiquidityRequest({
        destinationAccount: 'peer.testing.' + this.client2.name + '.hi',
        destinationHoldDuration: 3000
      })
      return this.client1.peer.unpaid('ilp', packet).then(result => {
        const resultObj = IlpPacket.deserializeIlqpLiquidityResponse(result.data)
        assert.deepEqual(resultObj, {
          liquidityCurve: Buffer.from('00000000000000000000000000000000000000000000ffff000000000000ffff', 'hex'),
          appliesToPrefix: 'peer.testing.' + this.client2.name + '.',
          sourceHoldDuration: 15000,
          expiresAt: resultObj.expiresAt
        })
      })
    })


    it('should respond to info', function () {
      const packet = Buffer.from([0])
      return this.client1.peer.unpaid('info', packet).then(response => {
        const infoStr = response.data.slice(2).toString('ascii') // assume length <= 127
        assert.deepEqual(response.data[0], 2)
        assert.deepEqual(response.data[1], infoStr.length)
        assert.deepEqual(infoStr, 'peer.testing.' + this.client1.name)
        assert.equal(response.protocolName, 'info')
      })
    })

    it('should respond to balance', function () {
      const packet = Buffer.from([0])
      return this.client1.peer.unpaid('balance', packet).then(response => {
        assert.deepEqual(response.data, Buffer.from('02080000000000002710', 'hex'))
        assert.equal(response.protocolName, 'balance')
      })
    })

    it('should make a payment', function () {
      const fulfillment = crypto.randomBytes(32)
      const condition = crypto.createHash('sha256').update(fulfillment).digest()
      this.client2.fulfillments[condition.toString('hex')] = fulfillment
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1234',
        account: 'peer.testing.' + this.client2.name + '.hi'
      })
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: '1234',
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      return this.client1.peer.interledgerPayment(transfer, packet).then(result => {
        assert.deepEqual(result, fulfillment)
        return this.client1.peer.unpaid('balance', Buffer.from([0]))
      }).then(response => {
        // (10000 - 1234) = 34 * 256 + 62
        assert.deepEqual(response.data, Buffer.from([2, 8, 0, 0, 0, 0, 0, 0, 34, 62]))
        assert.equal(response.protocolName, 'balance')
      })
    })
  })
})

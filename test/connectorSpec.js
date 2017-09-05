const assert = require('chai').assert
const crypto = require('crypto')

const IlpPacket = require('ilp-packet')

const Connector = require('../src/connector')
const sha256 = require('../src/sha256')

describe('Connector', () => {
  beforeEach(function () {
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
    this.connector.peers.ledger_dummy.fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
    return this.connector.listen(8000)
  })
  afterEach(function () {
    return this.connector.close()
  })

  describe('two clients', () => {
    beforeEach(function () {
      this.client1 = new Connector('peer.testing.', {})
      this.client2 = new Connector('peer.testing.', {})
      // return this.client1.open('ws://localhost:8000/')
      return Promise.all([ this.client1.connect('ws://localhost:8000/', 'local8000'), this.client2.connect('ws://localhost:8000/', 'local8000') ])
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
 console.log(this.client1.peers)
      return this.client1.peers.upstream_local8000.clp.unpaid('ilp', packet).then(result => {
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
      return this.client1.peers.upstream_local8000.clp.unpaid('info', packet).then(response => {
        const infoStr = response.data.slice(2).toString('ascii') // assume length <= 127
        assert.deepEqual(response.data[0], 2)
        assert.deepEqual(response.data[1], infoStr.length)
        assert.deepEqual(infoStr, 'peer.testing.downstream_' + this.client1.name)
        assert.equal(response.protocolName, 'info')
      })
    })

    it('should respond to balance', function () {
      const packet = Buffer.from([0])
      return this.client1.peers.upstream_local8000.clp.unpaid('balance', packet).then(response => {
        assert.deepEqual(response.data, Buffer.from('02080000000000002710', 'hex'))
        assert.equal(response.protocolName, 'balance')
      })
    })

    it('should make a payment', function () {
      const fulfillment = crypto.randomBytes(32)
      const condition = sha256(fulfillment)

      this.client2.knowFulfillment(condition, fulfillment)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1234',
        account: 'peer.testing.' + this.client2.name + '.hi'
      })
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: 1234,
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      return this.client1.peers.upstream_local8000.interledgerPayment(transfer, packet).then(result => {
        assert.deepEqual(result, fulfillment)
        assert.equal(this.connector.peers['downstream_' + this.client1.name].clp.balance, 8766)
        assert.equal(this.connector.peers['downstream_' + this.client2.name].clp.balance, 11234)
        return this.client1.peers.upstream_local8000.clp.unpaid('balance', Buffer.from([0]))
      }).then(response => {
        // (10000 - 1234) = 34 * 256 + 62
        assert.deepEqual(response.data, Buffer.from([2, 8, 0, 0, 0, 0, 0, 0, 34, 62]))
        assert.equal(response.protocolName, 'balance')
      })
    })

    it('should store a vouch', function () {
      const wallet = 'test.crypto.eth.rinkeby.4thgw3dtrseawfrsfdxzsfzsfgdz'
      // console.log(  Buffer.from([0, wallet.length]), Buffer.from(wallet, 'ascii'))
      const packet = Buffer.concat([
        Buffer.from([0, wallet.length]),
        Buffer.from(wallet, 'ascii')
      ])
      return this.client1.peers.upstream_local8000.clp.unpaid('vouch', packet).then(result => {
        // console.log(result)
        assert.equal(this.connector.vouchingMap[wallet], 'downstream_' + this.client1.name)
      })
    })
  })
})

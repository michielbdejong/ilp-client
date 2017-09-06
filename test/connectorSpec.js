const assert = require('chai').assert
const crypto = require('crypto')

const IlpPacket = require('ilp-packet')

const IlpNode = require('../src/index')
const sha256 = require('../src/sha256')

describe('IlpNode', () => {
  beforeEach(function () {
    this.ilpNode = new IlpNode({
      clp: {
        listen: 8000,
        name: 'server',
        initialBalancePerPeer: 10000,
        upstreams: []
      },
      xrp: {
        secret: 'shRm6dnkLMzTxBUMgCy6bB6jweS3X',
        server: 'wss://s.altnet.rippletest.net:51233',
        prefix: 'test.crypto.xrp.'
      },
      dummy: {
        prefix: 'test.crypto.eth.rinkeby.'
      }
    })
    this.ilpNode.peers.ledger_dummy.fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
    return this.ilpNode.start()
  })
  afterEach(function () {
    return this.ilpNode.stop()
  })

  describe('two clients', () => {
    beforeEach(function () {
      this.client1 = new IlpNode({ clp: { name: 'client1', upstreams: [ { url: 'ws://localhost:8000', token: 'foo' } ] } })
      this.client2 = new IlpNode({ clp: { name: 'client2', upstreams: [ { url: 'ws://localhost:8000', token: 'bar' } ] } })
      // return this.client1.open('ws://localhost:8000/')
      return Promise.all([ this.client1.start(), this.client2.start() ])
    })
    afterEach(function () {
      // return this.client1.close()
      return Promise.all([ this.client1.stop(), this.client2.stop() ])
    })

    it('should respond to quote', function () {
      // console.log('in the test!')
      const packet = IlpPacket.serializeIlqpLiquidityRequest({
        destinationAccount: 'peer.testing.server.downstream_client2.hi',
        destinationHoldDuration: 3000
      })
      // console.log('asking quote', this.client1.peers)
      return this.client1.peers.upstream_wslocalhost8000.clp.unpaid('ilp', packet).then(result => {
        const resultObj = IlpPacket.deserializeIlqpLiquidityResponse(result.data)
        assert.deepEqual(resultObj, {
          liquidityCurve: Buffer.from('00000000000000000000000000000000000000000000ffff000000000000ffff', 'hex'),
          appliesToPrefix: 'peer.testing.server.downstream_client2.',
          sourceHoldDuration: 15000,
          expiresAt: resultObj.expiresAt
        })
      })
    })

    it('should respond to info', function () {
      const packet = Buffer.from([0])
      return this.client1.peers.upstream_wslocalhost8000.clp.unpaid('info', packet).then(response => {
        const infoStr = response.data.slice(2).toString('ascii') // assume length <= 127
        assert.deepEqual(response.data[0], 2)
        assert.deepEqual(response.data[1], infoStr.length)
        assert.deepEqual(infoStr, 'peer.testing.server.downstream_client1')
        assert.equal(response.protocolName, 'info')
      })
    })

    it('should respond to balance', function () {
      const packet = Buffer.from([0])
      return this.client1.peers.upstream_wslocalhost8000.clp.unpaid('balance', packet).then(response => {
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
        account: 'peer.testing.server.downstream_client2.hi'
      })
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: 1234,
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      return this.client1.peers.upstream_wslocalhost8000.interledgerPayment(transfer, packet).then(result => {
        assert.deepEqual(result, fulfillment)
        assert.equal(this.ilpNode.peers['downstream_' + this.client1.config.clp.name].clp.balance, 8766)
        assert.equal(this.ilpNode.peers['downstream_' + this.client2.config.clp.name].clp.balance, 11234)
        return this.client1.peers.upstream_wslocalhost8000.clp.unpaid('balance', Buffer.from([0]))
      }).then(response => {
        // (10000 - 1234) = 34 * 256 + 62
        assert.deepEqual(response.data, Buffer.from([2, 8, 0, 0, 0, 0, 0, 0, 34, 62]))
        assert.equal(response.protocolName, 'balance')
      })
    })

    it('should store a vouch', function () {
      const address = 'test.crypto.eth.rinkeby.4thgw3dtrseawfrsfdxzsfzsfgdz'
      return this.client1.peers.upstream_wslocalhost8000.vouchBothWays(address).then(result => {
        // console.log(result)
        assert.equal(this.ilpNode.vouchingMap[address], 'downstream_' + this.client1.config.clp.name)
      })
    })
  })
})

const assert = require('chai').assert
const crypto = require('crypto')
const uuid = require('uuid/v4')

const IlpPacket = require('ilp-packet')

const IlpNode = require('../src/index')
const sha256 = require('../src/sha256')

describe('High Throughput', () => {
  beforeEach(function () {
    this.ilpNode = new IlpNode({
      btp: {
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
        prefix: 'test.dummy.'
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
      this.client1 = new IlpNode({ btp: { name: 'client1', upstreams: [ { url: 'ws://localhost:8000', token: 'foo' } ] } })
      this.client2 = new IlpNode({ btp: { name: 'client2', upstreams: [ { url: 'ws://localhost:8000', token: 'bar' } ] } })
      // return this.client1.open('ws://localhost:8000/')
      return Promise.all([ this.client1.start(), this.client2.start() ])
    })
    afterEach(function () {
      // return this.client1.close()
      return Promise.all([ this.client1.stop(), this.client2.stop() ])
    })

    it('should make 1000 BTP to BTP payments (two hops inside single thread)', function () {
      this.timeout(10000)
      const sendOne = () => {
        const fulfillment = crypto.randomBytes(32)
        const condition = sha256(fulfillment)

        this.client2.knowFulfillment(condition, fulfillment)
        const packet = IlpPacket.serializeIlpPayment({
          amount: '1',
          account: 'peer.testing.server.downstream_client2.hi'
        })
        const transfer = {
          // transferId will be added  by Peer#conditional(transfer, protocolData)
          amount: 1,
          executionCondition: condition,
          expiresAt: new Date(new Date().getTime() + 100000)
        }
        return this.client1.peers.upstream_wslocalhost8000.interledgerPayment(transfer, packet).then(result => {
          assert.deepEqual(result, fulfillment)
        })
      }
      let promises = []
      for (let i = 0; i < 1000; i++) {
        promises.push(sendOne())
      }
      return Promise.all(promises)
    })

    it('should make 1000 ilp-plugin-onledger-escrow to BTP payments (using dummy plugin)', function (done) {
      this.timeout(10000)
      const NUM = 1000
      const fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
      const condition = sha256(fulfillment)

      this.ilpNode.vouchingMap['test.dummy.client1'] = 'downstream_client1'

      // console.log('setting up test', fulfillment, condition)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1',
        account: 'peer.testing.server.downstream_client2.hi'
      })
      this.client2.knowFulfillment(condition, fulfillment)

      // This is ledger plugin interface format, will be used in incoming_prepare event
      // to VirtualPeer:
      const lpiTransfer = {
        id: uuid(),
        from: 'test.dummy.client1',
        to: 'test.dummy.server',
        ledger: 'test.dummy.',
        amount: '1',
        ilp: packet,
        noteToSelf: {},
        executionCondition: condition.toString('base64'),
        expiresAt: new Date(new Date().getTime() + 100000),
        custom: {}
      }
      for (let i = 0; i < NUM; i++) {
        this.ilpNode.peers.ledger_dummy.plugin.handlers.incoming_prepare(lpiTransfer)
      }

      let numDone = 0
      this.ilpNode.peers.ledger_dummy.plugin.successCallback = () => {
        if (++numDone === NUM) {
          done()
        }
      }
    })

    it('should make 1000 BTP to ilp-plugin-onledger-escrow payments (using dummy plugin)', function () {
      this.timeout(10000)
      const fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
      const condition = sha256(fulfillment)

      // console.log('setting up test', fulfillment, condition)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1',
        account: 'test.dummy.client2'
      })
      this.ilpNode.peers.ledger_dummy.plugin.fulfillment = fulfillment
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: 1,
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      // console.log('test prepared!', transfer, this.ilpNode.peers.ledger_dummy.plugin)
      let promises = []
      for (let i = 0; i < 1000; i++) {
        promises.push(this.client1.peers.upstream_wslocalhost8000.interledgerPayment(transfer, packet).then(result => {
          assert.deepEqual(result, fulfillment)
        }))
      }
      return Promise.all(promises)
    })
  })
})

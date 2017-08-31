const assert = require('chai').assert
const crypto = require('crypto')
const uuid = require('uuid/v4')

const IlpPacket = require('ilp-packet')

const Connector = require('../src/connector')
const Client = require('../src/client')
const sha256 = require('../src/sha256')

describe('High Throughput', () => {
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
    return this.connector.open(8000)
  })
  afterEach(function () {
    return this.connector.close()
  })

  describe('two clients', () => {
    beforeEach(function () {
      this.client1 = new Client()
      this.client2 = new Client()

      this.wallet1 = 'test.crypto.eth.rinkeby.4thgw3dtrseawfrsfdxzsfzsfgdz'
      return Promise.all([ this.client1.open('ws://localhost:8000/'), this.client2.open('ws://localhost:8000/') ]).then(() => {
        const packet = Buffer.concat([
          Buffer.from([0, this.wallet1.length]),
          Buffer.from(this.wallet1, 'ascii')
        ])
        return this.client1.peer.clp.unpaid('vouch', packet)
      })
    })
    afterEach(function () {
      // return this.client1.close()
      return Promise.all([ this.client1.close(), this.client2.close() ])
    })

    it('should make 1000 CLP to CLP payments (two hops inside single thread)', function () {
      this.timeout(10000)
      const sendOne = () => {
        const fulfillment = crypto.randomBytes(32)
        const condition = sha256(fulfillment)

        this.client2.fulfillments[condition] = fulfillment
        const packet = IlpPacket.serializeIlpPayment({
          amount: '1',
          account: 'peer.testing.' + this.client2.name + '.hi'
        })
        const transfer = {
          // transferId will be added  by Peer#conditional(transfer, protocolData)
          amount: 1,
          executionCondition: condition,
          expiresAt: new Date(new Date().getTime() + 100000)
        }
        return this.client1.peer.interledgerPayment(transfer, packet).then(result => {
          assert.deepEqual(result, fulfillment)
        })
      }
      let promises = []
      for (let i = 0; i < 1000; i++) {
        promises.push(sendOne())
      }
      return Promise.all(promises)
    })

    it('should make 1000 ilp-plugin-onledger-escrow to CLP payments (using dummy plugin)', function (done) {
      this.timeout(10000)
      const NUM = 1000
      const fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
      const condition = sha256(fulfillment)

      // console.log('setting up test', fulfillment, condition)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1',
        account: 'peer.testing.' + this.client2.name + '.hi'
      })
      this.client2.fulfillments[condition] = fulfillment

      // This is ledger plugin interface format, will be used in incoming_prepare event
      // to VirtualPeer:
      const lpiTransfer = {
        id: uuid(),
        from: this.wallet1,
        to: 'test.crypto.eth.rinkeby.dummy-account',
        ledger: 'test.crypto.eth.rinkeby.',
        amount: '1',
        ilp: packet,
        noteToSelf: {},
        executionCondition: condition.toString('base64'),
        expiresAt: new Date(new Date().getTime() + 100000),
        custom: {}
      }
      for (let i = 0; i < NUM; i++) {
        this.connector.peers.ledger_dummy.plugin.handlers.incoming_prepare(lpiTransfer)
      }

      let numDone = 0
      this.connector.peers.ledger_dummy.plugin.successCallback = () => {
        if (++numDone === NUM) {
          done()
        }
      }
    })

    it('should make 1000 CLP to ilp-plugin-onledger-escrow payments (using dummy plugin)', function () {
      this.timeout(10000)
      const fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
      const condition = sha256(fulfillment)

      // console.log('setting up test', fulfillment, condition)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1',
        account: this.wallet1
      })
      this.connector.peers.ledger_dummy.plugin.fulfillment = fulfillment
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: 1,
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      // console.log('test prepared!', transfer, this.connector.peers.ledger_dummy.plugin)
      let promises = []
      for (let i = 0; i < 1000; i++) {
        promises.push(this.client1.peer.interledgerPayment(transfer, packet).then(result => {
          assert.deepEqual(result, fulfillment)
        }))
      }
      return Promise.all(promises)
    })
  })
})

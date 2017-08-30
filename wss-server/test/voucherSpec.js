const assert = require('chai').assert
const crypto = require('crypto')
const uuid = require('uuid/v4')

const IlpPacket = require('ilp-packet')

const Connector = require('../connector')
const Client = require('../client')
const sha256 = require('../sha256')

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
        return this.client1.peer.unpaid('vouch', packet)
      })
    })
    afterEach(function () {
      return Promise.all([ this.client1.close(), this.client2.close() ])
    })

    it('should deliver to dummy ledger', function () {
      const fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
      const condition = sha256(fulfillment)

      // console.log('setting up test', fulfillment, condition)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1234',
        account: this.wallet1
      })
      this.connector.peers.ledger_dummy.plugin.fulfillment = fulfillment
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: '1235',
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      // console.log('test prepared!', transfer, this.connector.peers.ledger_dummy.plugin)
      return this.client1.peer.interledgerPayment(transfer, packet).then(result => {
        assert.deepEqual(result, fulfillment)
        assert.deepEqual(this.connector.peers.ledger_dummy.plugin.transfers[0], {
          id: this.connector.peers.ledger_dummy.plugin.transfers[0].id,
          from: 'test.crypto.eth.rinkeby.dummy-account',
          to: 'test.crypto.eth.rinkeby.4thgw3dtrseawfrsfdxzsfzsfgdz',
          ledger: 'test.crypto.eth.rinkeby.',
          amount: '1234',
          ilp: packet,
          noteToSelf: {},
          executionCondition: condition.toString('base64'),
          expiresAt: this.connector.peers.ledger_dummy.plugin.transfers[0].expiresAt,
          custom: {}
        })
      })
    })

    it('should accept from vouched wallets on dummy ledger', function (done) {
      const fulfillment = Buffer.from('1234*fulfillment1234*fulfillment', 'ascii')
      const condition = sha256(fulfillment)

      // console.log('setting up test', fulfillment, condition)
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1234',
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
        amount: '1234',
        ilp: packet,
        noteToSelf: {},
        executionCondition: condition.toString('base64'),
        expiresAt: new Date(new Date().getTime() + 100000),
        custom: {}
      }
      this.connector.peers.ledger_dummy.plugin.successCallback = (transferId, fulfillmentBase64) => {
        assert.equal(transferId, lpiTransfer.id)
        assert.deepEqual(Buffer.from(fulfillmentBase64, 'base64'), fulfillment)
        done()
      }
      this.connector.peers.ledger_dummy.plugin.failureCallback = (transferId, rejectionReasonObj) => {
        done(rejectionReasonObj)
      }
      this.connector.peers.ledger_dummy.plugin.handlers.incoming_prepare(lpiTransfer)
    })
  })
})

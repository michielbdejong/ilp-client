const assert = require('chai').assert
const crypto = require('crypto')

const IlpPacket = require('ilp-packet')
const XrpPlugin = require('ilp-plugin-xrp-escrow')

const Client = require('../src/client')
const VirtualPeer = require('../src/virtual-peer')
const sha256 = require('../src/sha256')

function Flooder () {
  // connector's on-ledger address:
  this.config = require('../config/xrp.js')

  this.wallet0 = this.config[0].prefix + this.config[0].address

  this.client1 = new Client()
  this.plugin1 = new XrpPlugin(this.config[1])
  this.wallet1 = this.config[1].prefix + this.config[1].address
  this.client1.sendAndReceiveOnLedger(this.plugin1, this.wallet0)

  this.client2 = new Client()
  this.plugin2 = new XrpPlugin(this.config[2])
  this.wallet2 = this.config[2].prefix + this.config[2].address
  this.client2.sendAndReceiveOnLedger(this.plugin2, this.wallet0)
}

Flooder.prototype = {
  open (url) {
    return Promise.all([ this.client1.open(url), this.client2.open(url) ]).then(() => {
      return Promise.all([
        this.client1.peer.clp.unpaid('vouch', Buffer.concat([
          Buffer.from([0, this.wallet1.length]),
          Buffer.from(this.wallet1, 'ascii')
        ])),
        this.client2.peer.clp.unpaid('vouch', Buffer.concat([
          Buffer.from([0, this.wallet2.length]),
          Buffer.from(this.wallet2, 'ascii')
        ])),
        this.plugin1.connect(),
        this.plugin2.connect()
      ])
    })
  },
  close () {
    return Promise.all([
      this.client1.close(),
      this.client2.close(),
      this.plugin1.disconnect(),
      this.plugin2.disconnect()
    ])
  },
  sendOne (from, to) {
    const fulfillment = crypto.randomBytes(32)
    const condition = sha256(fulfillment)

    // set up receiver; this will work for both the client's CLP Peer
    // and its XRP VirtualPeer:
    this.client2.knowFulfillment(condition, fulfillment)
    console.log('receiver set up', condition, fulfillment)

    const packet = IlpPacket.serializeIlpPayment({
      amount: '1',
      account: (to === 'clp' ? 'peer.testing.' + this.client2.name + '.hi' : this.wallet2)
    })
    const transfer = {
      // transferId will be added  by Peer#conditional(transfer, protocolData)
      amount: 1,
      executionCondition: condition,
      expiresAt: new Date(new Date().getTime() + 100000)
    }
    const peerToUse = (from === 'clp' ?
      this.client1.peer :
      this.client1.virtualPeer)
    console.log('sending payment', from, to)
    return peerToUse.interledgerPayment(transfer, packet).then(result => {
      console.log('success!', from, to, condition, fulfillment, result)
    }, (err) => {
      console.error('fail!', JSON.stringify(err))
      process.exit(1)
    })
  },
  flood (num, from, to) {
    let promises = []
    for (let i = 0; i < num; i++) {
      promises.push(this.sendOne(from, to))
    }
    return Promise.all(promises)
  }
}

console.log(process.argv)
const NUM = parseInt(process.argv[2]) || 1
const from = process.argv[3] || 'clp'
const to = process.argv[4] || 'clp'

const flooder = new Flooder()
let startTime
flooder.open('ws://localhost:8000/').then(() => {
  startTime = new Date().getTime()
  return flooder.flood(NUM, from, to)
}).then(() => {
  const endTime = new Date().getTime()
  console.log(NUM + ' transfers took ' + (endTime - startTime) + 'ms, that is '  + (1000 * NUM / (endTime - startTime)) + ' payments per second.')
  flooder.close()
})

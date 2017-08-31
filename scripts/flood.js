const assert = require('chai').assert
const crypto = require('crypto')

const IlpPacket = require('ilp-packet')

const Client = require('../src/client')
const sha256 = require('../src/sha256')
function Flooder () {
  this.client1 = new Client()
  this.client2 = new Client()

  this.wallet1 = 'test.crypto.eth.rinkeby.4thgw3dtrseawfrsfdxzsfzsfgdz'
}

Flooder.prototype = {
  open (url) {
    return Promise.all([ this.client1.open(url), this.client2.open(url) ]).then(() => {
      const packet = Buffer.concat([
        Buffer.from([0, this.wallet1.length]),
        Buffer.from(this.wallet1, 'ascii')
      ])
      return this.client1.peer.clp.unpaid('vouch', packet)
    })
  },
  close () {
    return Promise.all([ this.client1.close(), this.client2.close() ])
  },
  sendOne () {
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
    }, (err) => {
      console.error(JSON.stringify(err))
      process.exit(1)
    })
  },
  flood (num) {
    let promises = []
    for (let i = 0; i < num; i++) {
      promises.push(this.sendOne())
    }
    return Promise.all(promises)
  }
}

const NUM = 100000
const flooder = new Flooder()
let startTime
flooder.open('ws://localhost:8000/').then(() => {
  startTime = new Date().getTime()
  return flooder.flood(NUM)
}).then(() => {
  const endTime = new Date().getTime()
  console.log(NUM + ' transfers took ' + (endTime - startTime) + 'ms, that is '  + (1000 * NUM / (endTime - startTime)) + ' payments per second.')
  flooder.close()
})

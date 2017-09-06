const crypto = require('crypto')

const sha256 = require('../src/sha256')
const IlpPacket = require('ilp-packet')
const IlpNode = require('../src/index')

function Flooder () {
  this.client1 = new IlpNode(require('../config/client1'))
  this.client2 = new IlpNode(require('../config/client2'))
}

Flooder.prototype = {
  open () {
    return Promise.all([ this.client1.start(), this.client2.start() ])
  },
  close () {
    return Promise.all([
      this.client1.stop(),
      this.client2.stop()
    ])
  },
  sendOne (from, to) {
    const fulfillment = crypto.randomBytes(32)
    const condition = sha256(fulfillment)

    // set up receiver; this will work for both the client's CLP Peer
    // and its XRP VirtualPeer:
    this.client2.knowFulfillment(condition, fulfillment)
    // console.log('receiver set up', condition, fulfillment)

    this.client2.getIlpAddress(to).then(ilpAddress => {
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1',
        account: ilpAddress,
      })
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: 1, // TODO: get quote first for exchange rates
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }

      const peer = this.client1.getPeer(from)
      // console.log(peer)
      return peer.interledgerPayment(transfer, packet)
    }).then(result => {
      // console.log('success!', from, to, condition, fulfillment, result)
    }, (err) => {
      console.error('fail!', JSON.stringify(err))
      throw err
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
flooder.open().then(() => {
  console.log('flooder open, flooding')
  startTime = new Date().getTime()
  return flooder.flood(NUM, from, to)
}).then(() => {
  const endTime = new Date().getTime()
  console.log(NUM + ' transfers took ' + (endTime - startTime) + 'ms, that is '  + (1000 * NUM / (endTime - startTime)) + ' payments per second.')
  // console.log(Object.keys(flooder.client1.peer.clp.transfersSent).length) -> 0
  flooder.close()
}, err => {
  const endTime = new Date().getTime()
  console.log('FAIL', err, 'took ' + (endTime - startTime) + 'ms.')
  // console.log(Object.keys(flooder.client1.peer.clp.transfersSent).length) -> 0
  flooder.close()
})

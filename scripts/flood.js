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

    // set up receiver; this will work for both the client's BTP Peer
    // and its XRP VirtualPeer:
    this.client2.knowFulfillment(condition, fulfillment)
    // console.log('receiver set up', condition, fulfillment)

    return this.client2.getIlpAddress(to).then(ilpBaseAddress => {
      // console.log({ ilpBaseAddress })
      const packet = IlpPacket.serializeIlpPayment({
        amount: '1',
        account: ilpBaseAddress + '.hi'
      })
      // console.log({ packet })
      const transfer = {
        // transferId will be added  by Peer#conditional(transfer, protocolData)
        amount: 1, // TODO: get quote first for exchange rates
        executionCondition: condition,
        expiresAt: new Date(new Date().getTime() + 100000)
      }
      // console.log({ ilpBaseAddress, transfer, packet })
      const peer = this.client1.getPeer(from)
      // console.log(peer)
      return new Promise((resolve) => {
      //  const timer = setInterval(() => {
      //    if (from === 'btp' || peer.connectorAddress) {
      //      clearInterval(timer)
            resolve(peer.interledgerPayment(transfer, packet))
      //    } else {
      //      console.log('waiting for a peer to give us a connector address for ' + from, peer)
      //    }
      //  }, 1000)
      })
    }).then(result => {
      // console.log('success!', from, to, condition, fulfillment, result)
    }, (err) => {
      console.error('fail!', JSON.stringify(err.message))
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
const from = process.argv[3] || 'btp'
const to = process.argv[4] || 'btp'

const flooder = new Flooder()
let startTime
flooder.open().then(() => {
  return new Promise((resolve) =>{ 
    setTimeout(resolve, 1000)
  })
}).then(() => {
  console.log('flooder open, flooding')
  startTime = new Date().getTime()
  return flooder.flood(NUM, from, to)
}).then(() => {
  const endTime = new Date().getTime()
  console.log(NUM + ' transfers took ' + (endTime - startTime) + 'ms, that is ' + (1000 * NUM / (endTime - startTime)) + ' payments per second.')
  // console.log(Object.keys(flooder.client1.peer.btp.transfersSent).length) -> 0
  flooder.close()
}, err => {
  const endTime = new Date().getTime()
  console.log('FAIL', err, 'took ' + (endTime - startTime) + 'ms.')
  // console.log(Object.keys(flooder.client1.peer.btp.transfersSent).length) -> 0
  flooder.close()
})

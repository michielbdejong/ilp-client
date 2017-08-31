const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')
const Plugin = require('ilp-plugin-xrp-escrow')

const config = require('../config/xrp')
const sender = new Plugin(config[1])
const receiver = new Plugin(config[2])
const numTrans = 2

function sha256(fulfillment) {
  return crypto.createHash('sha256').update(fulfillment).digest()
}

Promise.all([sender.connect(), receiver.connect()]).then(() => {
  console.log('connected', sender.getAccount(), receiver.getAccount())
  const fulfillment = crypto.randomBytes(32)
  const condition = sha256(fulfillment)

  receiver.on('incoming_prepare', (transfer) => {
    console.log('transfer arrived', transfer)
    receiver.fulfillCondition(transfer.id, fulfillment.toString('base64'))
  })
  let successes = 0
  sender.on('outgoing_fulfill', (transfer, fulfillment) => { console.log('test success!', ++successes) })
  sender.on('outgoing_reject', (transfer, reason) => { console.log('test failed by receiver!', transfer, reason) })
  sender.on('outgoing_cancel', (transfer, reason) => { console.log('test failed by ledger!', transfer, reason) })

  setTimeout(function() {
    console.log('first timeout fired')
    sender.sendTransfer({
      id: uuid(),
      ledger: sender.getInfo().prefix,
      from: sender.getAccount(),
      to: receiver.getAccount(),
      amount: '10',
      expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
      executionCondition: condition.toString('base64'),
      ilp: Packet.serializeIlpPayment({ amount: '1', account: receiver.getAccount() }).toString('base64'),
      noteToSelf: {}
    }).then(() => {
      console.log('first transfer sent')
    }, err => {
      console.err('first transfer failed', err)
    })
  }, 10000)
  setTimeout(function() {
    console.log('second timeout fired')
    sender.sendTransfer({
      id: uuid(),
      ledger: sender.getInfo().prefix,
      from: sender.getAccount(),
      to: receiver.getAccount(),
      amount: '10',
      expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
      executionCondition: condition.toString('base64'),
      ilp: Packet.serializeIlpPayment({ amount: '1', account: receiver.getAccount() }).toString('base64'),
      noteToSelf: {}
    }).then(() => {
      console.log('second transfer sent')
    }, err => {
      console.err('second transfer failed', err)
    })
  }, 20000)
})

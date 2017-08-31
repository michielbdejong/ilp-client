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

  let arriveds = 0
  let submitteds = 0
  receiver.on('incoming_prepare', (transfer) => {
    console.log('transfer arrived', ++arriveds, transfer)
    receiver.fulfillCondition(transfer.id, fulfillment.toString('base64')).then(() => {
      console.log('submitted', ++submitteds)
    }, err => {
      console.error('submit failed!', err)
    })
  })
  let successes = 0
  sender.on('outgoing_fulfill', (transfer, fulfillment) => { console.log('test success!', ++successes) })
  sender.on('outgoing_reject', (transfer, reason) => { console.log('test failed by receiver!', transfer, reason) })
  sender.on('outgoing_cancel', (transfer, reason) => { console.log('test failed by ledger!', transfer, reason) })
  let sents = 0
  function send() {
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
      console.log('transfer sent', ++sents)
    }, err => {
      console.err('transfer failed', err)
    })
  }
  setTimeout(function() {
    console.log('first timeout fired')
    send()
  }, 5000)
  setTimeout(function() {
    console.log('second timeout fired')
    send()
  }, 6000)
})

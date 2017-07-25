const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')

// sender - an object that exposes https://interledger.org/rfcs/0004-ledger-plugin-interface
// receiver - an object that exposes https://interledger.org/rfcs/0004-ledger-plugin-interface
// connector - undefined or <String> an ILP address

module.exports = function(sender, receiver, connector) {
  return Promise.all([sender.connect(), receiver.connect()]).then(() => {
    console.log('connected', sender.getAccount(), receiver.getAccount())
    const secret = crypto.randomBytes(32)
    const executionCondition = crypto.createHash('sha256').update(secret).digest('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '')
  
    receiver.on('incoming_prepare', (transfer) => {
      console.log('transfer arrived', transfer)
      receiver.fulfillCondition(transfer.id, secret.toString('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, ''))
    })
  
    sender.on('outgoing_fulfill', (transfer, fulfillment) => { console.log('test success!', transfer, fulfillment) })
    sender.on('outgoing_reject', (transfer, fulfillment) => { console.log('test fail 1!', transfer, fulfillment) })
    sender.on('outgoing_cancel', (transfer, fulfillment) => { console.log('test fail 2!', transfer, fulfillment) })
  
    return sender.sendTransfer({
      id: uuid(),
      ledger: sender.getInfo().prefix,
      from: sender.getAccount(),
      to: connector || sender.getInfo().connectors[0],
      amount: '10',
      expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
      executionCondition,
      ilp: Packet.serializeIlpPayment({ amount: '1', account: receiver.getAccount() }).toString('base64'),
      noteToSelf: {}
    })
  })
}

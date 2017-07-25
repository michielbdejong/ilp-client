const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')

module.exports = function(sender, receiver, connector, receiverAddress) {
  return Promise.all([sender.connect(), receiver.connect()]).then(() => {
    console.log('connected', sender.getAccount(), receiver.getAccount())
    const secret = crypto.randomBytes(32)
    const executionCondition = crypto.createHash('sha256').update(secret).digest('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '')
  
    receiver.on('incoming_prepare', (transfer) => {
      console.log('transfer arrived', transfer)
      receiver.fulfillCondition(transfer.id, secret.toString('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, ''))
    })
  
    const promise = new Promise((resolve, reject) => {
      sender.on('outgoing_fulfill', (id, fulfillment) => { console.log('test success!', id, fulfillment); resolve() })
      sender.on('outgoing_reject', (id, fulfillment) => { console.log('test fail 1!', id, fulfillment); reject() })
      sender.on('outgoing_cancel', (id, fulfillment) => { console.log('test fail 2!', id, fulfillment); reject() })
    })
  
    return sender.sendTransfer({
      id: uuid(),
      ledger: sender.getInfo().prefix,
      from: sender.getAccount(),
      to: connector || sender.getInfo().connectors[0],
      amount: '10',
      expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
      executionCondition,
      ilp: Packet.serializeIlpPayment({
        amount: '1',
        account: receiverAddress || receiver.getAccount(),
      }).toString('base64'),
      noteToSelf: {}
    }).then(() => {
      console.log('sent')
      return promise
    })
  }).then(() => {
    console.log('disconnecting')
    return Promise.all([sender.disconnect(), receiver.disconnect()])
  }).then(() => {
     delete sender
     delete receiver
    console.log('done')
  }, (err) => {
    console.error('fail', err)
  })
}

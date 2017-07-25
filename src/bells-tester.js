const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')
const Plugin = require('ilp-plugin-bells')

// const sender = new Plugin({ account: 'https://red.ilpdemo.org/ledger/accounts/alice', password: 'alice' })
// const receiver = new Plugin({ account: 'https://blue.ilpdemo.org/ledger/accounts/bob', password: 'bobbob' })
let sender = new Plugin({ account: 'https://michiel-is-not-available.herokuapp.com/ledger/accounts/admin', password: 'admin' })
let receiver = new Plugin({ account: 'https://michiel-eur.herokuapp.com/ledger/accounts/admin', password: 'admin' })

Promise.all([sender.connect(), receiver.connect()]).then(() => {
  console.log('connected')
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
    to: sender.getInfo().connectors[0],
    amount: '10',
    expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
    executionCondition,
    ilp: Packet.serializeIlpPayment({
      amount: '1',
      account: receiver.getAccount(),
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

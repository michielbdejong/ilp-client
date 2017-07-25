const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')
const Plugin = require('ilp-plugin-bells')

const sender = new Plugin({ account: 'https://red.ilpdemo.org/ledger/accounts/alice', password: 'alice' })
const receiver = new Plugin({ account: 'https://blue.ilpdemo.org/ledger/accounts/bob', password: 'bobbob' })

Promise.all([sender.connect(), receiver.connect()]).then(() => {
  const secret = crypto.randomBytes(32)
  const executionCondition = crypto.createHash('sha256').update(secret).digest('base64').replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '')

  receiver.on('incoming_prepare', (transfer) => {
    console.log('transfer arrived', transfer)
    receiver.fulfillCondition(transfer.id, secret.toString('base64'))
  })

  sender.on('outgoing_fulfill', (id, fulfillment) => {
    console.log('test success!', id, fulfillment)
  })

   sender.on('outgoing_reject', (id, fulfillment) => {
     console.log('test fail 1!', id, fulfillment)
   })
 
   sender.on('outgoing_cancel', (id, fulfillment) => {
     console.log('test fail 2!', id, fulfillment)
   })

  sender.sendTransfer({
    id: uuid(),
    ledger: sender.getInfo().prefix,
    from: sender.getAccount(),
    to: sender.getInfo().connectors[0],
    amount: '2',
    expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
    executionCondition,
    ilp: Packet.serializeIlpPayment({
      amount: '1',
      account: receiver.getAccount(),
    }).toString('base64'),
    noteToSelf: {}
  }).catch((err) => {
    console.log('send fail', err)
  })
})

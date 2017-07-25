console.log('Instantiating xrp tester',
  process.env.XRP_ADDRESS,
  process.env.XRP_SECRET,
  process.env.XRP_SERVER,
  process.env.CONNECTOR,
  process.env.PLUGIN
)
const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')
const Plugin = require(process.env.PLUGIN)

const plugin = new Plugin({
  secret: process.env.XRP_SECRET,
  server: process.env.XRP_SERVER
})
const secretBuff = crypto.randomBytes(32)
const hash = crypto.createHash('sha256').update(secretBuff).digest('base64')
const secret = secretBuff.toString('base64')

plugin.connect().then(() => {
  plugin.on('incoming_prepare', (transfer) => {
    console.log('transfer arrived', transfer)
    plugin.fulfillCondition(transfer.id, secret.toString('base64'))
  })
  plugin.on('outgoing_fulfill', (id, fulfillment) => {
    console.log('test success!', id, fulfillment)
  })
  console.log('sending')
  const transfer = {
    id: uuid(),
    ledger: 'test.crypto.xrp.',
    from: 'test.crypto.xrp.' + process.env.XRP_ADDRESS,
    to: 'test.crypto.xrp.' + process.env.CONNECTOR,
    amount: 2,
    expiresAt: new Date(new Date().getTime() + 100000).toISOString(),
    executionCondition: hash,
    ilp: Packet.serializeIlpPayment({
      amount: '1',
      account: 'test.crypto.xrp.' + process.env.XRP_ADDRESS
    }).toString('base64'),
    noteToSelf: {}
  }
  plugin.sendTransfer(transfer).then(result => {
    console.log('send result', result)
  }, (err) => {
    console.log('send fail', err)
  })
  console.log('sent', transfer)
})

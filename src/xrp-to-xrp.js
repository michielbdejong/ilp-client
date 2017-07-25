console.log('Instantiating xrp-to-xrp testnet connector',
  process.env.XRP_ADDRESS,
  process.env.XRP_SECRET,
  process.env.XRP_SERVER,
  process.env.PLUGIN
)
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')

const Plugin = require(process.env.PLUGIN)
const plugins = {
  xrp: new Plugin({
    secret: process.env.XRP_SECRET,
    server: process.env.XRP_SERVER
  })
}
const kv = {
  store: {},
  set(k, v) { this.store[k] = v },
  get(k) { return this.store[k] }
}

function getNextHop(transfer) {
  const packet = Packet.deserializeIlpPayment(Buffer.from(transfer.ilp, 'base64'))
  if (packet.account.startsWith('test.crypto.xrp.')) {
    if (transfer.amount > packet.amount) {
      return {
        peer: 'xrp',
        transfer: {
          id: uuid(),
          ledger: 'test.crypto.xrp.',
          from: 'test.crypto.xrp.' + process.env.XRP_ADDRESS,
          to: packet.account,
          amount: packet.amount,
          executionCondition: transfer.executionCondition,
          expiresAt: new Date(new Date(transfer.expiresAt).getTime() - 10000).toISOString(),
          ilp: transfer.ilp,
          noteToSelf: {}
        }
      }
    } else {
      console.log('more money needed', transfer, packet)
    }
  } else {
    console.log('wrong network', packet.account)
  }
}

for (let peer in plugins) {
  plugins[peer].connect()

  plugins[peer].on('incoming_prepare', (transfer) => {
    console.log('incoming prepare!')
    console.log('incoming prepare!', transfer)
    const nextHop = getNextHop(transfer)
    plugins[nextHop.peer].sendTransfer(nextHop.transfer)
    kv.set(nextHop.transfer.id, {
      id: transfer.id,
      peer
    })
  })

  plugins[peer].on('outgoing_fulfill', (transfer, fulfillment) => {
    console.log('outgoing fulfill!')
    console.log('outgoing fulfill!', transfer, fulfillment)
    const data = kv.get(transfer.id)
    console.log('got data', data, transfer.id, kv.store)
    plugins[data.peer].fulfillCondition(data.id, fulfillment)
  })
}

// needed for heroku web process deploy:
require('http').createServer((req, res) => { res.end('nothing to see here') }).listen(process.env.PORT)

const WebSocket = require('ws');
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')
const Plugin = {
  xrp: require('ilp-plugin-xrp-escrow'),
  dummy: require('./test/dummyPlugin')
}
const VirtualPeer = require('./virtual-peer')

function Connector(baseLedger, pluginConfigs) {
  this.quoter = new Quoter()
  this.peers = {}
  this.baseLedger = baseLedger
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.vouchingMap = {}

  for (name in pluginConfigs) {
    const plugin = new Plugin[name](pluginConfigs[name])
    plugin.connect()    
    this.peers['ledger_' + name] = new VirtualPeer(plugin, this.forwarder, (fromAddress, amount) => {
      console.log('checkVouch', fromAddress, amount, this.vouchingMap, this.peers)
      if (!this.vouchingMap[fromAddress]) {
        return false
      }
      const balance = this.peers['peer_' + this.vouchingMap[fromAddress]].balance
      console.log('checking balance', balance, amount)
      return balance > amount
    })

    this.quoter.setCurve(plugin.getInfo().prefix, Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 255, 255,	0, 0, 0, 0, 0, 0, 255, 255
    ]), 'ledger_' + name)
  }
}

Connector.prototype = {
  open(port) {
    return new Promise(resolve => {
      this.wss = new WebSocket.Server({ port }, resolve)
    }).then(() => {
      this.wss.on('connection', (ws, httpReq) => {
        const parts = httpReq.url.split('/')
        const peerId = parts[1]
        const peerToken = parts[2] // TODO: use this to authorize reconnections
        // console.log('assigned peerId!', peerId)
        this.peers['peer_' + peerId] = new Peer(this.baseLedger, peerId, 10000, ws, this.quoter, this.forwarder, undefined, (address) => {
          this.vouchingMap[address] = peerId
          console.log('vouched!', this.vouchingMap)
          return Promise.resolve()
        })
        this.quoter.setCurve(this.baseLedger + peerId + '.', Buffer.from([
          0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 255, 255,	0, 0, 0, 0, 0, 0, 255, 255
        ]), 'peer_' + peerId)
      })
    })
  },
  close() {
    return new Promise(resolve => {
      this.wss.close(resolve)
    })
  }
}

module.exports = Connector

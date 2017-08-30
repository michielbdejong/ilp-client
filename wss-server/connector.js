const WebSocket = require('ws');
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')
const Plugin = {
  xrp: require('ilp-plugin-xrp-escrow')
}
const VirtualPeer = require('./virtual-peer')

const config = {
  xrp: {
    secret: 'shRm6dnkLMzTxBUMgCy6bB6jweS3X',
    server: 'wss://s.altnet.rippletest.net:51233',
    prefix: 'test.crypto.xrp.'
  }
}

function Connector(baseLedger) {
  this.quoter = new Quoter()
  this.peers = {}
  this.baseLedger = baseLedger
  this.forwarder = new Forwarder(this.quoter, this.peers)
  for (name in config) {
    const plugin = new Plugin[name](config[name])
    plugin.connect()
    this.peers[name] = new VirtualPeer(plugin, this.forwarder)
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
        console.log('assigned peerId!', peerId)
        this.peers[peerId] = new Peer(peerId, 10000, ws, this.quoter, this.forwarder)
        this.quoter.setCurve(this.baseLedger + peerId + '.', Buffer.from([
          0, 0, 0, 0, 0, 0, 0, 0,	0, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 255, 255,	0, 0, 0, 0, 0, 0, 255, 255
        ]), peerId)
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

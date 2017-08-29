const WebSocket = require('ws');
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')

function Connector() {
  this.quoter = new Quoter()
  this.peers = {}
  this.forwarder = new Forwarder(this.quoter, this.peers)
}

Connector.prototype = {
  open(port) {
    return new Promise(resolve => {
      this.wss = new WebSocket.Server({ port }, resolve)
    }).then(() => {
      this.wss.on('connection', (ws, httpReq) => {
        // TODO: test this with 1 connnector + 2 clients in test
        const peerId = httpReq.url
        this.peers[peerId] = new Peer(peerId, 0, ws, this.quoter, this.forwarder)
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

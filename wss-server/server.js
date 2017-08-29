const WebSocket = require('ws');
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')

function Connector(port) {
  this.quoter = new Quoter()
  this.peers = {}
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.wss = new WebSocket.Server({ port });
  this.wss.on('connection', (ws, httpReq) => {
    const peerId = httpReq.url
    this.peers[peerId] = new Peer(peerId, ws, this.quoter, this.forwarder)
  })
}

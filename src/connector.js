const WebSocket = require('ws')
const crypto = require('crypto')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')
const Plugin = {
  xrp: require('ilp-plugin-xrp-escrow'),
  dummy: require('../test/helpers/dummyPlugin')
}
const VirtualPeer = require('./virtual-peer')

function Connector (baseLedger, pluginConfigs) {
  this.name = crypto.randomBytes(16).toString('hex')
  this.token = crypto.randomBytes(16).toString('hex')
  this.upstreams = []
  this.fulfillments = {}
  this.quoter = new Quoter()
  this.peers = {}
  this.baseLedger = baseLedger
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.vouchingMap = {}

  for (let name in pluginConfigs) {
    const plugin = new Plugin[name](pluginConfigs[name])
    plugin.connect()
                           // function VirtualPeer (plugin, forwardCb, checkVouchCb, connectorAddress) {
    this.peers['ledger_' + name] = new VirtualPeer(plugin, this.handleTransfer.bind(this), (fromAddress, amount) => {
      // console.log('checkVouch', fromAddress, amount, this.vouchingMap)
      if (!this.vouchingMap[fromAddress]) {
        return false
      }
      const balance = this.peers[this.vouchingMap[fromAddress]].clp.balance
      // console.log('checking balance', balance, amount)
      return balance > amount
    })

    this.quoter.setCurve(plugin.getInfo().prefix, Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 255, 255,
      0, 0, 0, 0, 0, 0, 255, 255
    ]), 'ledger_' + name)
  }
}

Connector.prototype = {
  listen (port, initialBalancePerPeer = 10000) {
    return new Promise(resolve => {
      this.wss = new WebSocket.Server({ port }, resolve)
    }).then(() => {
      this.wss.on('connection', (ws, httpReq) => {
        const parts = httpReq.url.split('/')
        const peerId = parts[1]
        // const peerToken = parts[2] // TODO: use this to authorize reconnections
        // console.log('assigned peerId!', peerId)
        this.addPeer('downstream', peerId, initialBalancePerPeer, ws)
      })
    })
  },
  addPeer(peerType, peerId, initialBalance, ws) {
    const peerName = peerType + '_' + peerId
                            // function Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
     this.peers[peerName] = new Peer(this.baseLedger, peerName, initialBalance, ws, this.quoter, this.handleTransfer.bind(this), this.forwarder.forwardRoute.bind(this.forwarder), (address) => {
       this.vouchingMap[address] = peerName
       // console.log('vouched!', this.vouchingMap)
       return Promise.resolve()
     })
     this.quoter.setCurve(this.baseLedger + peerId + '.', Buffer.from([
       0, 0, 0, 0, 0, 0, 0, 0,
       0, 0, 0, 0, 0, 0, 0, 0,
       0, 0, 0, 0, 0, 0, 255, 255,
       0, 0, 0, 0, 0, 0, 255, 255
     ]), 'downstream_' + peerId)
  },
  handleTransfer(transfer, paymentPacket) {
   // console.log('client is fulfilling over CLP!', condition, this.fulfillments)
   return Promise.resolve(this.fulfillments[transfer.executionCondition.toString('hex')] || this.forwarder.forward(transfer, paymentPacket))
  },

  knowFulfillment(condition, fulfillment) {
    this.fulfillments[condition.toString('hex')] = fulfillment
  },

  connect (url, peerName) {
    return new Promise(resolve => {
      const ws = new WebSocket(url + this.name + '/' + this.token, {
        perMessageDeflate: false
      })
      ws.on('open', () => {
        // console.log('ws open')
        this.quoter = new Quoter()
        this.peers = {}
        this.forwarder = new Forwarder(this.quoter, this.peers)
        // console.log('creating client peer')
            // functionp Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
        this.upstreams.push(ws)
        return this.addPeers('upstream', Buffer.from(url, 'ascii').toString('hex'), 0, ws)
      })
    })
  },

  close () {
    let promises = this.upstreams.map(ws => {
      return new Promise(resolve => {
        ws.on('close', () => {
          // console.log('close emitted!')
          resolve()
        })
        // console.log('closing client!')
        ws.close()
        // console.log('started closing client!')
      })
    })
    if (this.wss) {
      promises.push(new Promise(resolve => {
        return this.wss.close(resolve)
      }))
    }
    return Promise.all(promises)
  }
}

module.exports = Connector

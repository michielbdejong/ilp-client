const WebSocket = require('ws')
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')
const Plugin = {
  xrp: require('ilp-plugin-xrp-escrow'),
  eth: require('ilp-plugin-ethereum'),
  dummy: require('../test/helpers/dummyPlugin')
}
const VirtualPeer = require('./virtual-peer')

function IlpNode (config) {
  this.upstreams = []
  this.fulfillments = {}
  this.quoter = new Quoter()
  this.peers = {}
  this.plugins = []
  this.config = config
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.vouchingMap = {}

  for (let name in this.config) {
    if (name === 'clp') {
      continue
    }
    const plugin = new Plugin[name](this.config[name])
    this.plugins.push(plugin)
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

IlpNode.prototype = {
  addClpPeer(peerType, peerId, ws) {
    const peerName = peerType + '_' + peerId
    const baseLedger = 'peer.testing.' + this.config.clp.name + '.' + peerName
    console.log({ peerType, peerId })
                            // function Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
     this.peers[peerName] = new Peer(baseLedger, peerName, this.config.clp.initialBalancePerPeer, ws, this.quoter, this.handleTransfer.bind(this), this.forwarder.forwardRoute.bind(this.forwarder), (address) => {
       this.vouchingMap[address] = peerName
       // console.log('vouched!', this.vouchingMap)
       return Promise.resolve()
     })
     this.quoter.setCurve(this.baseLedger + peerId + '.', Buffer.from([
       0, 0, 0, 0, 0, 0, 0, 0,
       0, 0, 0, 0, 0, 0, 0, 0,
       0, 0, 0, 0, 0, 0, 255, 255,
       0, 0, 0, 0, 0, 0, 255, 255
     ]), peerName)
     return Promise.resolve()
  },

  connectPlugins() {
    let promises = []
    for (let i=0; i < this.plugins.length; i++) {
      promises.push(this.plugins[i].connect())
    }
    return Promise.all(promises)
  },

  maybeListen () {
    return new Promise(resolve => {
      if (typeof this.config.clp.listen !== 'number') {
        return
      }
      this.wss = new WebSocket.Server({ port: this.config.clp.listen }, resolve)
    }).then(() => {
      this.wss.on('connection', (ws, httpReq) => {
        const parts = httpReq.url.split('/')
        const peerId = parts[1]
        // const peerToken = parts[2] // TODO: use this to authorize reconnections
        // console.log('assigned peerId!', peerId)
        this.addClpPeer('downstream', peerId, ws)
      })
    })
  },

  connectToUpstreams () {
    return Promise.all(this.config.clp.upstreams.map(upstreamConfig => {
      const peerName = upstreamConfig.url.replace(/(?!\w)./g, '')
      console.log({ url: upstreamConfig.url, peerName })
      return new Promise((resolve, reject) => {
        console.log('connecting to upstream WebSocket', upstreamConfig.url + '/' + this.config.clp.name + '/' + upstreamConfig.token, this.config.clp, upstreamConfig)
        const ws = new WebSocket(upstreamConfig.url + '/' + this.config.clp.name + '/' + upstreamConfig.token, {
          perMessageDeflate: false
        })
        ws.on('open', () => {
          // console.log('creating client peer')
              // functionp Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
          this.upstreams.push(ws)
          this.addClpPeer('upstream', peerName, ws).then(resolve, reject)
        })
      })
    }))
  },

  start() {
    return Promise.all([
      this.maybeListen(),
      this.connectToUpstreams(),
      this.connectPlugins()
    ])
  },

  stop () {
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
  },

  knowFulfillment(condition, fulfillment) {
    this.fulfillments[condition.toString('hex')] = fulfillment
  },

  // actual receiver and connector functionality for incoming transfers:
  handleTransfer(transfer, paymentPacket) {
   // console.log('client is fulfilling over CLP!', condition, this.fulfillments)
   return Promise.resolve(this.fulfillments[transfer.executionCondition.toString('hex')] || this.forwarder.forward(transfer, paymentPacket))
  },

  getIlpAddress (ledger) {
    if (this.config[ledger].prefix + this.config[ledger].address) {
      // used in xrp and eth configs
      return this.config[ledger].prefix + this.config[ledger].address
    } else {
      // used in clp config
      return 'peer.testing.' + this.config[ledger].name + '.hi'
    }
  },

  getPeersList () {
    return Object.keys(this.peers)
  },

  getPeer (peerName) {
    return this.peers[peerName]
  }
}

// methods accessed from outside:
// const ilpNode = new IlpNode(config)
// ilpNode.start()
// ilpNode.stop()

// ilpNode.knowFulfillment(condition, fulfillment)
// ilpNode.getIlpAddress(ledger)
// ilpNode.pay(peerName, destination, amount, condition
// ilpNode.getQuote(peerName, quoteRequest)
// ilpNode.broadcastRoutes(routes)

module.exports = IlpNode

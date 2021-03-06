const BtpNode = require('clp-node')
const VouchPacket = require('./protocols').VouchPacket

const Plugin = {
  xrp: require('ilp-plugin-xrp-escrow'),
  eth: require('ilp-plugin-ethereum'),
  dummy: require('../test/helpers/dummyPlugin')
}
const Quoter = require('./quoter')
const Forwarder = require('./forwarder')
const Peer = require('./peer')
const VirtualPeer = require('./virtual-peer')

function IlpNode (config) {
  this.btpNode = new BtpNode(config.btp, this.addBtpPeer.bind(this), this.handleBtpMessage.bind(this))
  this.plugins = []
  this.vouchableAddresses = []
  this.vouchablePeers = []
  this.fulfillments = {}
  this.quoter = new Quoter()
  this.peers = {}
  this.msgHandler = {}
  this.defaultPeers = {}
  this.config = config
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.vouchingMap = {}

  for (let name in this.config) {
    if (name === 'btp') {
      continue
    }
    // console.log('plugin', config, name)
    const plugin = new Plugin[name](this.config[name])
    this.plugins.push(plugin)
    //                        function VirtualPeer (plugin, onIncomingTransfer) {
    this.peers['ledger_' + name] = new VirtualPeer(plugin, this.handleTransfer.bind(this))
    // auto-vouch ledger VirtualPeer -> all existing BTP peers
    this.addVouchableAddress(plugin.getAccount())
    // and add the plugin ledger as a destination in to the routing table:
    this.quoter.setCurve(plugin.getInfo().prefix, Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 255, 255,
      0, 0, 0, 0, 0, 0, 255, 255
    ]), 'ledger_' + name)
  }
}

IlpNode.prototype = {
  handleBtpMessage(msg, whoAmI, baseUrl, urlPath) {
    // console.log('handleBtpMessage', { msg, whoAmI, baseUrl, urlPath }, Object.keys(this.msgHandler))
    if (!this.msgHandler[baseUrl + urlPath]) {
      return Promise.reject(new Error('have no msg handler for that peer'))
    }
    return this.msgHandler[baseUrl + urlPath](msg)
  },
  addVouchablePeer (peerName) {
    this.vouchablePeers.push(peerName)
    return Promise.all(this.vouchableAddresses.map(address => {
      // console.log('new vouchable peer', peerName, address)
      return this.peers[peerName].vouchBothWays(address)
    }))
  },

  addVouchableAddress (address) {
    this.vouchableAddresses.push(address)
    return Promise.all(this.vouchablePeers.map(peerName => {
      // console.log('new vouchable address', peerName, address)
      return this.peers[peerName].vouchBothWays(address)
    }))
  },

  addBtpPeer (whoAmI, baseUrl, urlPath) {
    let peerType
    let peerId
    if (whoAmI === 'server') {
      peerType = 'downstream'
      parts = urlPath.split('/')
      peerId = parts[4]
    } else {
      peerType = 'downstream'
      peerId = url.replace(/(?!\w)./g, '')
    }

    const peerName = peerType + '_' + peerId

    // FIXME: this is a hacky way to make `node scripts/flood.js 1 btp btp` work  
    this.defaultBtpPeer = peerName

    const ledgerPrefix = 'peer.testing.' + this.config.btp.name + '.' + peerName + '.'
    // console.log({ peerType, peerId })
    //                function Peer (ledgerPrefix, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
    // console.log('creating peer!', baseUrl, urlPath)
    const that = this
    this.peers[peerName] = new Peer(ledgerPrefix, peerName, this.config.btp.initialBalancePerPeer, {
      on(eventName, eventHandler) {
        // console.log('setting message handler!', baseUrl, urlPath)
        that.msgHandler[baseUrl + urlPath] = eventHandler
      },
      send(msg) {
        // console.log('peer is calling my send!', baseUrl, urlPath, msg)
        that.btpNode.send(baseUrl + urlPath, msg)
      }
    }, this.quoter, this.handleTransfer.bind(this), this.forwarder.forwardRoute.bind(this.forwarder), (vouchType, address) => {
      // console.log('vouch came in!', vouchType, address, this.config)
      if (vouchType === VouchPacket.TYPE_VOUCH) {
        // charge rollbacks for `address` to `peerName` trustline balance
        this.vouchingMap[address] = peerName
      } else if (vouchType === VouchPacket.TYPE_REACHME) {
        for (let peerName in this.peers) {
          // console.log({ peerName })
          if (!peerName.startsWith('ledger_')) {
            continue
          }
          const ledgerName = peerName.substring('ledger_'.length)
          if (address.startsWith(this.config[ledgerName].prefix)) {
            // console.log('have a connector on', ledgerName, address, peerName)
            this.peers[`ledger_${ledgerName}`].setConnectorAddress(address)
          }
        }
      }
      // console.log('peer has vouched!', vouchType, address, this.vouchingMap)
      return Promise.resolve()
    })
    // auto-vouch all existing ledger VirtualPeers -> BTP peer
    this.addVouchablePeer(peerName)
    // and add the BTP trustline as a destination in to the routing table:
    this.quoter.setCurve(ledgerPrefix, Buffer.from([
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 255, 255,
      0, 0, 0, 0, 0, 0, 255, 255
    ]), peerName)
    return Promise.resolve()
  },

  connectPlugins () {
    let promises = []
    for (let i = 0; i < this.plugins.length; i++) {
      promises.push(this.plugins[i].connect())
    }
    return Promise.all(promises)
  },

  start () {
    return Promise.all([ this.btpNode.start(), this.connectPlugins() ])
  },

  stop () {
    // close ws/wss clients:
    let promises = [ this.btpNode.stop() ]

    // disconnect plugins:
    promises.push(this.plugins.map(plugin => plugin.disconnect()))
    return Promise.all(promises)
  },

  knowFulfillment (condition, fulfillment) {
    this.fulfillments[condition.toString('hex')] = fulfillment
  },

  checkVouch (fromAddress, amount) {
    // console.log('checkVouch', fromAddress, amount, this.vouchingMap)
    if (!this.vouchingMap[fromAddress]) {
      return false
    }
    // console.log('vouching peer is', this.vouchingMap[fromAddress], Object.keys(this.peers))
    const balance = this.peers[this.vouchingMap[fromAddress]].btp.balance
    // console.log('checking balance', balance, amount)
    return balance > amount
  },

  // actual receiver and connector functionality for incoming transfers:
  handleTransfer (transfer, paymentPacket) {
    // console.log('handleTransfer came in index!', transfer, paymentPacket, this.fulfillments)
    if (this.fulfillments[transfer.executionCondition.toString('hex')]) {
      return Promise.resolve(this.fulfillments[transfer.executionCondition.toString('hex')])
    }
    // Technically, this is checking the vouch for the wrong
    // amount, but if the vouch checks out for the source amount,
    // then it's also good enough to cover onwardAmount
    if (transfer.from && !this.checkVouch(transfer.from, parseInt(transfer.amount))) {
      return Promise.reject(new Error('vouch'))
    }
    return Promise.resolve(this.forwarder.forward(transfer, paymentPacket))
  },

  getIlpAddress (ledger) {
    // console.log('getting ilp addres', ledger, this.config)
    if (this.config[ledger].prefix && this.config[ledger].account) {
      // used in xrp and eth configs
      return Promise.resolve(this.config[ledger].prefix + this.config[ledger].account)
    } else {
      // used in btp config
      return this.peers[this.defaultBtpPeer].getMyIlpAddress()
    }
  },

  getPeersList () {
    return Object.keys(this.peers)
  },

  getPeer (ledger) {
    // console.log(this.defaultBtpPeer, Object.keys(this.peers))
    if (ledger === 'btp') {
      // FIXME: this is a hacky way to make `node scripts/flood.js 1 btp btp` work  
      return this.peers[this.defaultBtpPeer]
    }
    return this.peers['ledger_' + ledger]
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

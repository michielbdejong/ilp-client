const WebSocket = require('ws')
const http = require('http')
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

const letsEncrypt = require('./letsencrypt')

function IlpNode (config) {
  this.upstreams = []
  this.serversToClose = []
  this.plugins = []
  this.vouchableAddresses = []
  this.vouchablePeers = []
  this.fulfillments = {}
  this.quoter = new Quoter()
  this.peers = {}
  this.defaultPeers = {}
  this.config = config
  this.forwarder = new Forwarder(this.quoter, this.peers)
  this.vouchingMap = {}

  for (let name in this.config) {
    if (name === 'clp') {
      continue
    }
    // console.log('plugin', config, name)
    const plugin = new Plugin[name](this.config[name])
    this.plugins.push(plugin)
    //                        function VirtualPeer (plugin, onIncomingTransfer) {
    this.peers['ledger_' + name] = new VirtualPeer(plugin, this.handleTransfer.bind(this))
    // auto-vouch ledger VirtualPeer -> all existing CLP peers
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

  addClpPeer (peerType, peerId, ws) {
    const peerName = peerType + '_' + peerId

    // FIXME: this is a hacky way to make `node scripts/flood.js 1 clp clp` work  
    this.defaultClpPeer = peerName

    const ledgerPrefix = 'peer.testing.' + this.config.clp.name + '.' + peerName + '.'
    // console.log({ peerType, peerId })
    //                function Peer (ledgerPrefix, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
    this.peers[peerName] = new Peer(ledgerPrefix, peerName, this.config.clp.initialBalancePerPeer, ws, this.quoter, this.handleTransfer.bind(this), this.forwarder.forwardRoute.bind(this.forwarder), (vouchType, address) => {
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
    // auto-vouch all existing ledger VirtualPeers -> CLP peer
    this.addVouchablePeer(peerName)
    // and add the CLP trustline as a destination in to the routing table:
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

  maybeListen () {
    return new Promise((resolve, reject) => {
      if (this.config.clp.tls) { // case 1: use LetsEncrypt => [https, http]
        letsEncrypt('amundsen.michielbdejong.com').then(resolve, reject)
      } else if (typeof this.config.clp.listen !== 'number') { // case 2: don't open run a server => []
        resolve([])
      } else { // case 3: listen without TLS on a port => [http]
        const server = http.createServer((req, res) => {
          res.end('This is a CLP server, please upgrade to WebSockets.')
        })
        server.listen(this.config.clp.listen, resolve([ server ]))
      }
    }).then(servers => {
      // console.log('servers:', servers.length)
      this.serversToClose = servers
      if (servers.length) {
        this.wss = new WebSocket.Server({ server: servers[0] })
        this.serversToClose.push(this.wss)
        this.wss.on('connection', (ws, httpReq) => {
          const parts = httpReq.url.split('/')
          // console.log('client connected!', parts)
          // Note that the spec version and the token will probably disappear from the URL
          // in Interledger Testnet Stack Version 2, due to https://github.com/interledger/rfcs/issues/294
          // and https://github.com/interledger/interledger/wiki/Interledger-over-CLP#changes-to-setup
          // respectively.
          //        0: '', 1: software, 2: api, 3: spec, 4: name, 5: token
          // e.g. [ '', 'ilp-node-3', 'api', 'v1', 'a7f0e298941b772f5abc028d477938b6bbf56e1a14e3e4fae97015401e8ab372', 'ea16ed65d80fa8c760e9251b235e3d47893e7c35ffe3d9c57bd041200d1c0a50' ]
          const peerId = parts[4]
          // const peerToken = parts[5] // TODO: use this to authorize reconnections
          // console.log('assigned peerId!', peerId)
          this.addClpPeer('downstream', peerId, ws)
        })
      }
    })
  },

  connectToUpstreams () {
    return Promise.all(this.config.clp.upstreams.map(upstreamConfig => {
      const peerName = upstreamConfig.url.replace(/(?!\w)./g, '')
      // console.log({ url: upstreamConfig.url, peerName })
      return new Promise((resolve, reject) => {
        // console.log('connecting to upstream WebSocket', upstreamConfig.url + '/' + this.config.clp.name + '/' + upstreamConfig.token, this.config.clp, upstreamConfig)
        const ws = new WebSocket(upstreamConfig.url + '/' + this.config.clp.name + '/' + upstreamConfig.token, {
          perMessageDeflate: false
        })
        ws.on('open', () => {
          // console.log('creating client peer')
          this.upstreams.push(ws)
          this.addClpPeer('upstream', peerName, ws).then(resolve, reject)
        })
      })
    }))
  },

  start () {
    return Promise.all([
      this.maybeListen(), // .then(() => { console.log('maybeListen done', this.config) }),
      this.connectToUpstreams(), // .then(() => { console.log('connectToUpstreams done', this.config) }),
      this.connectPlugins() // .then(() => { console.log('connectPlugins done', this.config) })
    ])
  },

  stop () {
    // close ws/wss clients:
    let promises = this.upstreams.map(ws => {
      return new Promise(resolve => {
        ws.on('close', () => {
          resolve()
        })
        ws.close()
      })
    })

    // close http, https, ws/wss servers:
    promises.push(this.serversToClose.map(server => {
      return new Promise((resolve) => {
        server.close(resolve)
      })
    }))

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
    const balance = this.peers[this.vouchingMap[fromAddress]].clp.balance
    // console.log('checking balance', balance, amount)
    return balance > amount
  },

  // actual receiver and connector functionality for incoming transfers:
  handleTransfer (transfer, paymentPacket) {
    // console.log('handleTransfer came in index!', transfer, paymentPacket)
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
    if (this.config[ledger].prefix && this.config[ledger].account) {
      // used in xrp and eth configs
      return Promise.resolve(this.config[ledger].prefix + this.config[ledger].account)
    } else {
      // used in clp config
      return this.peers[this.defaultClpPeer].getMyIlpAddress()
    }
  },

  getPeersList () {
    return Object.keys(this.peers)
  },

  getPeer (ledger) {
    // console.log(this.defaultClpPeer, Object.keys(this.peers))
    if (ledger === 'clp') {
      // FIXME: this is a hacky way to make `node scripts/flood.js 1 clp clp` work  
      return this.peers[this.defaultClpPeer]
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

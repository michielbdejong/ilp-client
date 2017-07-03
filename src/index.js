const redis = require("redis")
const keypair = require('./lib/keypair')
const getHostInfo = require('./lib/hostInfo')
const handleWebFinger = require('./lib/webfinger')
const Peer = require('./lib/peer').Peer
const Hopper = require('./lib/hopper').Hopper
const crypto = require('crypto')

function hash(hostname) {
  return crypto
      .createHmac('sha256', 'hostname')
      .update(hostname)
      .digest('hex')
}

function IlpNode (redisUrl, hostname) {
  console.log('function IlpNode (', { redisUrl, hostname })
  this.client = redis.createClient({ url: redisUrl })
  this.client.on('error', function (err) {
      console.log('Error ' + err)
  })

  this.hopper = new Hopper()
  this.hostname = hostname
  this.stats = {
    hosts: {},
    ledgers: {},
    connectors: {}
  }
  this.peers = {}
  this.creds = {
    hosts: {},  // map hostname hashes back to hostname preimages
    ledgers: {} // for remembering RPC endpoints for peer ledgers
                // for stats on destination ledgers, see this.stats.ledgers (for stats export), copied from this.peers[peerHost].routes (for use by hopper)
  }
  this.ready = false
  this.lastLedgerStatsCollectionTime = 0
}

IlpNode.prototype = {
  ensureReady: async function() {
    if (this.ready === false) {
      console.log('triggering init')
      this.ready = await this.init()
      console.log('init completed by us')
      this.ready = true
    }
    if (this.ready !== true) {
      console.log('init already triggered')
      await this.ready
      console.log('init completed by other')
    }
  },
  collectLedgerStats: function(minDelay) {
    if (this.lastLedgerStatsCollectionTime > new Date().getTime() - minDelay) {
      return
    }
    this.lastLedgerStatsCollectionTime = new Date().getTime()
    for (let peerHost in this.peers) {
      for (let dest in this.peers[peerHost].routes) {
        if (typeof this.stats.ledgers[dest] === 'undefined') {
          this.stats.ledgers[dest] = {}
        }
        this.stats.ledgers[dest][peerHost] = this.peers[peerHost].routes[dest]
      }
    }
  },
  load: function(key) {
    return new Promise((resolve, reject) => {
      this.client.get(key, (err, reply) => {
        if (err) {
          reject(err)
        } else {
          resolve(reply)
        }
      })
    }).then(reply => {
      if (reply !== null) {
        console.log('reply!', reply)
        this[key] = JSON.parse(reply)
      }
    })
  },
  save: function(key) {
    return new Promise((resolve, reject) => {
      this.client.set(key, JSON.stringify(this[key]), (err, reply) => {
        if (err) {
          reject(err)
        } else {
          resolve(reply)
        }
      })
    })
  },
  init: async function() {
    await this.load('stats')
    await this.load('creds')
    if (this.creds.keypair === undefined) {
      console.log('generating keypair')
      this.creds.keypair = keypair.generate()
      console.log(this.creds.keypair)
      await this.save('creds')
      console.log('saved')
    }
    this.tokenStore = new keypair.TokenStore(this.creds.keypair)
  },
  testAll: async function() {
    console.log('testAll!!!!testAll!!!!testAll!!!!testAll!!!!')
    const promises = []
    await this.ensureReady()
    for (let hostnameHash of Object.keys(this.stats.hosts)) {
      promises.push(this.testHost(this.creds.hosts[hostnameHash].hostname, false))
    }
    for (let prefix of Object.keys(this.creds.ledgers)) {
      promises.push(this.testPeer(this.creds.ledgers[prefix].hostname).catch(e => {
        console.error('Error testing peer', this.testPeer(this.creds.ledgers[prefix].hostname))
      }))
    }
    await Promise.all(promises)
    await this.save('stats')
    await this.save('creds')
  },
  peerWith: async function(peerHostname) {
    await this.ensureReady()
    console.log(this.creds, this.stats)
    this.creds.hosts[hash(peerHostname)] = { hostname: peerHostname }
    this.stats.hosts[hash(peerHostname)] = await getHostInfo(peerHostname, this.stats.hosts[peerHostname] || {})
    // console.log('this.stats.hosts[peerHostname]', this.stats.hosts[peerHostname])
    if (this.stats.hosts[hash(peerHostname)].pubKey && !this.peers[peerHostname]) {
      console.log('peering!', peerHostname)
      this.peers[peerHostname] = new Peer(peerHostname, this.tokenStore, this.hopper, this.stats.hosts[hash(peerHostname)].pubKey)
    }
    this.creds.ledgers[this.peers[peerHostname].ledger] = { hostname: peerHostname }
    console.log('linked', this.peers[peerHostname].ledger, peerHostname)
    await this.save('creds')
  },
  testHost: async function(testHostname, writeStats = true) {
    await this.ensureReady()
    this.peerWith(testHostname)
    if (writeStats) {
      await this.save('stats')
    }
  },
  testPeer: async function(testHostname) {
    await this.ensureReady()
    this.stats.hosts[hash(testHostname)].limit = await this.peers[testHostname].getLimit()
    this.stats.hosts[hash(testHostname)].balance = await this.peers[testHostname].getBalance()
  },
  announceRoute: async function(ledger, curve, peerHostname) {
    await this.ensureReady()
    return this.peers[peerHostname].announceRoute(ledger, curve)
  },
  handleWebFinger: async function(resource) {
    await this.ensureReady()
    return handleWebFinger(resource, this.creds, this.hostname)
  },
  handleRpc: async function(params, body) {
    console.log('handleRpc 1')
    await this.ensureReady()
    console.log('handleRpc 2')
    if (!this.creds.ledgers[params.prefix]) {
      console.log('peer not found!', params, JSON.stringify(this.creds.ledgers))
    }
    console.log('handleRpc 3')
    const peerHostname = this.creds.ledgers[params.prefix].hostname
    console.log('handle rpc 4', params, body, peerHostname, JSON.stringify(Object.keys(this.peers)), 'are the peer keys')
    return this.peers[peerHostname].handleRpc(params, body)
  },
}

module.exports = IlpNode

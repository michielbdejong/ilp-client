const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const keypair = require('./lib/keypair')
const getHostInfo = require('./lib/hostInfo')
const handleWebFinger = require('./lib/webfinger')
const Peer = require('./lib/rpc').Peer

function IlpNode (statsFileName, credsFileName, hostname) {
  console.log('function IlpNode (', { statsFileName, credsFileName, hostname })
  this.statsFileName = statsFileName
  this.credsFileName = credsFileName
  this.hostname = hostname
  this.stats = {
    hosts: {},
    ledgers: {}
  }
  this.peers = {}
  this.creds = {}
  this.ready = false
  this.init().then(() => {
    this.ready = true
  })
}

IlpNode.prototype = {
  init: async function() {
    await this.readFile('stats', this.statsFileName)
    await this.readFile('creds', this.credsFileName)
    console.log(this.credsFileName, this.creds)
    if (this.creds.keypair === undefined) {
      console.log('generating keypair')
      this.creds.keypair = keypair.generate()
      console.log(this.creds.keypair)
      await this.writeFile('creds', this.credsFileName)
      console.log('saved')
    }
    this.tokenStore = new keypair.TokenStore(this.creds.keypair)
  },
  readFile: async function(objName, fileName) {
    await new Promise((resolve, reject) => {
      fs.readFile(fileName, (err, buf) => {
        if (err) {
          console.log(`${objName} file ${fileName} does not exist, creating.`)
console.log('resolve 1') 
          this.writeFile(objName, fileName).then(resolve)
        } else {
          try {
            this[objName] = JSON.parse(buf)
          } catch(e) {
            console.error(`${objName} file ${fileName} exists but is corrupt, fatal.`)
            reject(e)
          }
        }
console.log('resolve 2') 
        resolve()
      })
    })
  },
  writeFile: async function(objName, fileName) {
    await new Promise((resolve, reject) => {
      fs.writeFile(fileName, JSON.stringify(this[objName], null, 2), (err) => {
        if (err) {
          mkdirp(path.dirname(fileName), (err2) => {
            if (err2) {
              reject(err2)
            } else {
              fs.writeFile(fileName, JSON.stringify(this[objName], null, 2), (err3) => {
                if (err3) {
                  reject(err3)
                } else {
console.log('resolve 3') 
                  resolve()
                }
              })
            }
          })
        } else {
console.log('resolve 4') 
          resolve()
        }
      })
    })
  },
  testAll: async function() {
    const promises = []
    for (let hostname of Object.keys(this.stats.hosts)) {
      promises.push(this.testHost(this.hostname, false))
    }
    await Promise.all(promises)
    await this.writeFile('stats', this.statsFileName)
  },
  testHost: async function(testHostname, writeStats = true) {
    this.stats.hosts[testHostname] = await getHostInfo(testHostname, this.stats.hosts[testHostname] || {})
    if (this.stats.hosts[testHostname].pubKey) {
      this.peers[testHostname] = new Peer(testHostname, this.tokenStore, this.stats.hosts[testHostname].pubKey)
      this.stats.ledgers[this.peers[testHostname].ledger] = { hostname: testHostname }
      console.log('linked', this.peers[testHostname].ledger, testHostname)
      await this.testPeer(testHostname)
    }
    if (writeStats) {
      await this.writeFile('stats', this.statsFileName)
    }
  },
  testPeer: async function(testHostname) {
    this.stats.hosts[testHostname].limit = await this.peers[testHostname].getLimit()
    this.stats.hosts[testHostname].balance = await this.peers[testHostname].getBalance()
  },
  handleWebFinger: async function(resource) {
    return handleWebFinger(resource, this.creds, this.hostname)
  },
  handleRpc: async function(params, body) {
    const peerHostname = this.stats.ledgers[params.prefix].hostname
    console.log('handle', params, body, peerHostname)
    return this.peers[peerHostname].handleRpc(params, body)
  },
}

module.exports = IlpNode

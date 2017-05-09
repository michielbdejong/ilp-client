const fs = require('fs')
const getHostInfo = require('./lib/hostInfo')
const handleWebFinger = require('./lib/webfinger')
const handleRpc = require('./lib/rpc')

function IlpNode (statsFileName, credsFileName, hostname) {
  console.log('function IlpNode (', { statsFileName, credsFileName, hostname })
  this.statsFileName = statsFileName
  this.stats = JSON.parse(fs.readFileSync(statsFileName))
  this.creds = JSON.parse(fs.readFileSync(credsFileName))
  this.hostname = hostname
}

IlpNode.prototype = {
  writeStats: async function() {
    await new Promise((resolve, reject) => {
      fs.writeFile(this.statsFileName, JSON.stringify(this.stats, null, 2), function(err) {
        if (err) reject(err)
        resolve()
      })
    })
  },
  testAll: async function() {
    const promises = []
    for (let hostname of Object.keys(this.stats.hosts)) {
      promises.push(this.testHost(this.hostname, false))
    }
    await Promise.all(promises)
    await this.writeStats()
  },
  testHost: async function(testHostname, writeStats = true) {
    this.stats.hosts[testHostname] = await getHostInfo(testHostname, this.stats.hosts[testHostname] || {})
    if (writeStats) {
      await this.writeStats()
    }
  },
  handleWebFinger: async function(resource) {
    return handleWebFinger(resource, this.creds, this.hostname)
  },
  handleRpc: async function(params) {
    return handleRpc(params, this.creds)
  },
}

module.exports = IlpNode

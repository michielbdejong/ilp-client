const fs = require('fs')
const getHostInfo = require('./lib/hostInfo')
const handleWebFinger = require('./lib/webfinger')
const handleRpc = require('./lib/rpc')

module.exports = function(statsFileName, credsFileName, hostname) {
  const creds = JSON.parse(fs.readFileSync(credsFileName))
  return {
    stats: JSON.parse(fs.readFileSync(statsFileName)),
    writeStats: async function() {
      await new Promise((resolve, reject) => {
        fs.writeFile(statsFileName, JSON.stringify(this.stats, null, 2), function(err) {
          if (err) reject(err)
          resolve()
        })
      })
    },
    testAll: async function() {
      const promises = []
      for (let hostname of Object.keys(this.stats.hosts)) {
        promises.push(this.testHost(hostname, false))
      }
      await Promise.all(promise)
      await this.writeStats()
    },
    testHost: async function(hostname, writeStats = true) {
      this.stats.hosts[hostname] = await getHostInfo(hostname, this.stats.hosts[hostname] || {})
      if (writeStats) {
        await this.writeStats()
      }
    },
    handleWebFinger,
    handleRpc
  }
}

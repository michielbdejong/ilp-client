const fs = require('fs')
const getHostInfo = require('./lib/hostInfo')
const handleWebFinger = require('./lib/webfinger')
const handleRpc = require('./lib/rpc')

module.exports = function(statsFileName, credsFileName, hostname) {
  const creds = JSON.parse(fs.readFileSync(credsFileName))
  return {
    stats: JSON.parse(fs.readFileSync(statsFileName)),
    testHost: async function(hostname) {
      this.stats.hosts[hostname] = await getHostInfo(hostname, this.stats.hosts[hostname] || {})
      fs.writeFile(statsFileName, JSON.stringify(this.stats, null, 2))
    },
    handleWebFinger,
    handleRpc
  }
}

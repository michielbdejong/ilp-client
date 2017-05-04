const fs = require('fs')
const getHostInfo = require('./hostInfo')

if (process.argv.length < 3) {
  throw new Error('Usage: node src/index.js statistics.json credentials.json')
}

const statsFileName = process.argv[2]
const credsFileName = process.argv[3]

const stats = JSON.parse(fs.readFileSync(statsFileName))
const creds = JSON.parse(fs.readFileSync(credsFileName))
console.log(stats, creds)

Promise.all(Object.keys(stats.hosts).map(async function(hostname) {
  stats.hosts[hostname] = await getHostInfo(hostname, stats.hosts[hostname])
})).then(() => {
  fs.writeFileSync(statsFileName, JSON.stringify(stats, null, 2))
})

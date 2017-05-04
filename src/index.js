const fs = require('fs')
const getHostInfo = require('./hostInfo')

if (process.argv.length < 5) {
  throw new Error('Usage: node src/index.js statistics.json credentials.json updateStats')
}

const statsFileName = process.argv[2]
const credsFileName = process.argv[3]
const action = process.argv[4]

const stats = JSON.parse(fs.readFileSync(statsFileName))
const creds = JSON.parse(fs.readFileSync(credsFileName))
console.log(stats, creds)

switch (action) {
case 'updateStats':
  Promise.all(Object.keys(stats.hosts).map(async function(hostname) {
    stats.hosts[hostname] = await getHostInfo(hostname, stats.hosts[hostname])
  })).then(() => {
    fs.writeFileSync(statsFileName, JSON.stringify(stats, null, 2))
  })
  break
}

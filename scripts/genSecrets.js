const fs = require('fs')
const crypto = require('crypto')
const baseUrl = process.argv[2] || 'ws://localhost:8000'

const name1 = crypto.randomBytes(32).toString('hex')
const token1 = crypto.randomBytes(32).toString('hex')
const name2 = crypto.randomBytes(32).toString('hex')
const token2 = crypto.randomBytes(32).toString('hex')

const url1 = baseUrl + '/' + name1 + '/' + token1
const url2 = baseUrl + '/' + name2 + '/' + token2
const xrpConf = require(__dirname + '/../config/xrp.js')
for (let i=0; i < xrpConf.length; i++) {
  xrpConf[i].connector = process.argv[3]
}

const clpConf = [
  { url: url1, name: name1, token: token1 },
  { url: url2, name: name2, token: token2 }
]
fs.writeFileSync(__dirname + '/../config/clp.js', 'module.exports = ' + JSON.stringify(clpConf, null, 2) + '\n')
fs.writeFileSync(__dirname + '/../config/xrp.js', 'module.exports = ' + JSON.stringify(xrpConf, null, 2) + '\n')

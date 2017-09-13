const fs = require('fs')
const crypto = require('crypto')
const baseUrl = process.argv[2] || 'ws://localhost:8000'

const name1 = crypto.randomBytes(32).toString('hex')
const token1 = crypto.randomBytes(32).toString('hex')
const name2 = crypto.randomBytes(32).toString('hex')
const token2 = crypto.randomBytes(32).toString('hex')

const url1 = baseUrl
const url2 = baseUrl

let conf1 = require(__dirname + '/../config/client1.js') // eslint-disable-line no-path-concat
let conf2 = require(__dirname + '/../config/client2.js') // eslint-disable-line no-path-concat

conf1.clp = {
  name: name1,
  initialBalancePerPeer: 10000,
  upstreams: [ {
    url: url1,
    token: token1
  } ]
}

conf2.clp = {
  name: name2,
  initialBalancePerPeer: 10000,
  upstreams: [ {
    url: url2,
    token: token2
  } ]
}


fs.writeFileSync(__dirname + '/../config/client1.js', 'module.exports = ' + JSON.stringify(conf1, null, 2) + '\n') // eslint-disable-line no-path-concat
fs.writeFileSync(__dirname + '/../config/client2.js', 'module.exports = ' + JSON.stringify(conf2, null, 2) + '\n') // eslint-disable-line no-path-concat

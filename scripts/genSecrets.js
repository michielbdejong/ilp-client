const fs = require('fs')
const crypto = require('crypto')
const baseUrl = process.argv[2] || 'ws://localhost:8000'

const name1 = crypto.randomBytes(32).toString('hex')
const token1 = crypto.randomBytes(32).toString('hex')
const name2 = crypto.randomBytes(32).toString('hex')
const token2 = crypto.randomBytes(32).toString('hex')

const url1 = baseUrl + '/' + name1 + '/' + token1
const url2 = baseUrl + '/' + name2 + '/' + token2
fs.writeFileSync(__dirname + '/../config/clp.js', 'module.exports = ' + JSON.stringify([
  { url: url1, name: name1, token: token1 },
  { url: url2, name: name2, token: token2 }
], null, 2))

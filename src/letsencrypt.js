'use strict'

const http = require('http')
const https = require('https')
const LE = require('greenlock').LE

module.exports = function getLetsEncryptServers (domain) {
  let httpServer
  const le = LE.create({
    // server: 'staging',
    server: 'https://acme-v01.api.letsencrypt.org/directory',
    acme: require('le-acme-core').ACME.create(),
    store: require('le-store-certbot').create({ configDir: '~/letsencrypt/etc', webrootPath: '~/letsencrypt/var/:hostname' }),
    challenges: { 'http-01': require('le-challenge-fs').create({ webrootPath: '~/letsencrypt/var/:hostname' }) },
    agreeToTerms: function (tosUrl, cb) { cb(null, tosUrl) },
    debug: true
  })
  return new Promise((resolve, reject) => {
    httpServer = http.createServer(le.middleware())
    httpServer.listen(80, (err) => {
      if (err) { reject(err) } else { resolve() }
    })
  }).then(() => {
    // console.log('greenlock middleware listening on port 80')
    return le.core.certificates.getAsync({
      email: `letsencrypt+${domain}@gmail.com`,
      domains: [ domain ]
    })
  }).then(function (certs) {
    if (!certs) {
      throw new Error('Should have acquired certificate for domains.')
    }
    // console.log(certs)
    return new Promise((resolve, reject) => {
      const httpsServer = https.createServer({
        key: certs.privkey,
        cert: certs.cert,
        ca: certs.chain
      }, (req, res) => {
        // console.log(req.url)
        res.end('Hello encrypted world')
      })
      httpsServer.listen(443, (err) => {
        if (err) { reject(err) } else { resolve([ httpsServer, httpServer ]) }
      })
    })
  })
}

// Usage:
// getLetsEncryptServers('amundsen.michielbdejong.com').then(servers => {
//   setTimeout(() => {
//     console.log('closing')
//     servers.map(server => server.close())
//   }, 1000000)
// })

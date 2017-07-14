const http = require('http')
const IlpNode = require('./index')

const keyValueStore = {
  storage: {},
  set(k, v, cb) { this.storage[k] = v; cb() },
  get(k, cb) { cb(null, this.storage[k] || null) }
}

const ilpNode = new IlpNode(keyValueStore, process.env.API_HOSTNAME, false, true)
ilpNode.peerWithAndTest('localhost:6001')
http.createServer(ilpNode.server.bind(ilpNode)).listen(process.env.CLIENT_PORT)

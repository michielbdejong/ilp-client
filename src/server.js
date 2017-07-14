const http = require('http')
const IlpNode = require('./index')

const keyValueStore = {
  storage: {},
  set(k, v, cb) { this.storage[k] = v; cb() },
  get(k, cb) { cb(null, this.storage[k] || null) }
}

const ilpNode = new IlpNode(keyValueStore, process.env.API_HOSTNAME, false, true)
setTimeout(() => {
  ilpNode.peerWithAndTest(process.env.PEER)
}, 2000) // this timeout allows to start up two local nodes and each establish its peer pair before they attempt to peer
http.createServer(ilpNode.server.bind(ilpNode)).listen(process.env.CLIENT_PORT)

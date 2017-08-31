const http = require('http')
const IlpNode = require('./index')

const keyValueStore = {
  storage: {},
  set(k, v, cb) { this.storage[k] = v; cb() },
  get(k, cb) { cb(null, this.storage[k] || null) }
}

const actAsConnector = !!process.env.ACT_AS_CONNECTOR
const ilpNode = new IlpNode(keyValueStore, process.env.API_HOSTNAME, false, actAsConnector)
setTimeout(() => {
  ilpNode.peerWithAndTest(process.env.PEER1)
  ilpNode.peerWithAndTest(process.env.PEER2)
  // if !actAsConnector, it will send out a test route and then a test payment
}, 2000) // this timeout allows to start up two local nodes and each establish its peer pair before they attempt to peer
http.createServer(ilpNode.server.bind(ilpNode)).listen(process.env.CLIENT_PORT)

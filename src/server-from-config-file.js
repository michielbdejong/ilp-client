const IlpNode = require('./index')

// ...
const config = require('../config/server.js')
const ilpNode = new IlpNode(config)
ilpNode.start().then(() => {
  console.log('started', config)
})

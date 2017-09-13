const IlpNode = require('./index')

// ...
const config = require('../config/amundsen.js')
const ilpNode = new IlpNode(config)
ilpNode.start().then(() => {
  console.log('started', config)
})

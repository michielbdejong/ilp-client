console.log('Instantiating xrp tester',
  process.env.XRP_ADDRESS,
  process.env.XRP_SECRET,
  process.env.XRP_SERVER,
  process.env.CONNECTOR,
  process.env.PLUGIN
)
const crypto = require('crypto')
const Packet = require('ilp-packet')
const uuid = require('uuid/v4')
const Plugin = require(process.env.PLUGIN)

const plugin = new Plugin({
  secret: process.env.XRP_SECRET,
  server: process.env.XRP_SERVER
})
const pay = require('./test-payment')

// pay to self:
pay(plugin, plugin, process.env.CONNECTOR)

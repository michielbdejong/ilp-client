// the values from earlier, fill in your own ones here!
const ADDRESS='rKVxyVcWApvaKCEhEiXgJWdg2hdGuTwDEV'
const SECRET='shRm6dnkLMzTxBUMgCy6bB6jweS3X'
const WEBSOCKETS='wss://s.altnet.rippletest.net:51233'
const CONNECTOR='rPpjQCZL3tzXPo4Qx8Fm7Pe5s1Xsa98cHg'
const PREFIX = 'test.crypto.xrp.'

const pay = require('./test-payment')
const Plugin = require('ilp-plugin-xrp-escrow')

const plugin = new Plugin({
  secret: SECRET,
  server: WEBSOCKETS,
  prefix: PREFIX
})

// pay to self:
pay(plugin, plugin, PREFIX + CONNECTOR)

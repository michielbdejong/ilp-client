'use strict'
const FiveBellsLedgerPlugin = require('ilp-plugin-bells')

function test() {  
  let plugin = new FiveBellsLedgerPlugin({
    account: 'https://red.ilpdemo.org/ledger/accounts/michieltest',
    password: 'michieltest'
  })
  plugin.verboseMemoryLeak = true
  return Promise.resolve()
  return plugin.connect().then(() => {
    console.log('connected')
    return plugin.disconnect()
  }).then(() => {
    console.log('disconnected')
    plugin.removeAllListeners()
    console.log(plugin)
    plugin = null
    console.log('deleted')
  })
}
test().then(() => {
  console.log('test complete')
  console.log(process._getActiveHandles())
  console.log(process._getActiveRequests())
})

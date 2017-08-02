'use strict'
let logs = 'https://raw.githubusercontent.com/michielbdejong/ilp-node/mj-ilpdemo-quote-tester/ilpdemo-tester.js\n'
    + 'Script that quotes and pays from red.ilpdemo.org to blue.ilpdemo.org every 10 seconds, and logs how that went; 1 means success, 0 means not so much...\n'
setInterval(function() {
  test().then(() => {
    console.log(new Date(), 1)
    logs += new Date().toString() + ' 1\n'
  }, (err) => {
    console.log(err)
    console.log(new Date(), 0)
    logs += new Date().toString() + ' 0\n'
  })
}, 10000)

function test() {
  let failTimer
  return new Promise((resolve, reject) => {
    failTimer = setTimeout(function() {
      reject()
    }, 10000)
    const SPSP = require('ilp').SPSP
    const FiveBellsLedgerPlugin = require('ilp-plugin-bells')
    
    const plugin = new FiveBellsLedgerPlugin({
      account: 'https://red.ilpdemo.org/ledger/accounts/michieltest',
      password: 'michieltest'
    })
    
    ;(async function () {
      await plugin.connect()
      if (process.env.DEBUG) { console.log('plugin connected') }
    
      const payment = await SPSP.quote(plugin, {
        receiver: 'michieltest@blue.ilpdemo.org',
        destinationAmount: '0.000000001',
        timeout: 10000
      })
    
      if (process.env.DEBUG) { console.log('got SPSP payment details:', payment) }
    
    // we can attach an arbitrary JSON object to the payment if we want it
    // to be sent to the receiver.
    payment.memo = { message: 'hello!' }
    
    await SPSP.sendPayment(plugin, payment)
    if (process.env.DEBUG) { console.log('receiver claimed funds!') }
    resolve()
    })()
  }).then(() => {
    clearTimeout(failTimer)
  })
}

// needed for heroku web process deploy:
require('http').createServer((req, res) => { res.end(logs) }).listen(process.env.PORT || 8000)

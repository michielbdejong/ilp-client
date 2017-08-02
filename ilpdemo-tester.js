'use strict'
let logs = []

let running = {
  9: .5,     // half-time of roughly one minute
  520: .5,   // half-time of roughly one hour
  12466: .5, // half-time of one day
  87255: .5, // half-time of one week
}

function updateRunning(newValue) {
  logs.unshift(new Date().toString() + ' this:' + newValue + ' minute:~' + running[9] + ' hour:~' + running[520] + ' day:~' + running[12466] + ' week:~' + running[87255])
  if (logs.length > 5000) {
    logs = logs.slice(-4000)
  }
  for (let halfTime in running) {
    running[halfTime] = (running[halfTime] * (halfTime-1) + newValue) / halfTime
  }
}

let running8640=8640
let running60580=60480

setInterval(function() {
  test().then(() => {
    console.log(new Date(), 1)
    updateRunning(1)
  }, (err) => {
    console.log(err)
    console.log(new Date(), 0)
    updateRunning(0)
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
require('http').createServer((req, res) => {
  res.end([
    'https://raw.githubusercontent.com/michielbdejong/ilp-node/mj-ilpdemo-quote-tester/ilpdemo-tester.js',
    'Script that quotes and pays from red.ilpdemo.org to blue.ilpdemo.org every 10 seconds, and logs how that went; 1 means success, 0 means not so much...'
  ].concat(logs).join('\n'))
}).listen(process.env.PORT || 8000)

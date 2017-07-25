const pay = require('./test-payment')
const Plugin = require('ilp-plugin-bells')

// const sender = new Plugin({ account: 'https://red.ilpdemo.org/ledger/accounts/alice', password: 'alice' })
// const receiver = new Plugin({ account: 'https://blue.ilpdemo.org/ledger/accounts/bob', password: 'bobbob' })
let sender = new Plugin({ account: 'https://michiel-is-not-available.herokuapp.com/ledger/accounts/admin', password: 'admin' })
let receiver = new Plugin({ account: 'https://michiel-eur.herokuapp.com/ledger/accounts/admin', password: 'admin' })
pay(sender, receiver)

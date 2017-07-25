const pay = require('./test-payment')
const Plugin = require('ilp-plugin-bells')

// pay(new Plugin({ account: 'https://red.ilpdemo.org/ledger/accounts/alice', password: 'alice' }),
//     new Plugin({ account: 'https://blue.ilpdemo.org/ledger/accounts/bob', password: 'bobbob' }))

pay(new Plugin({ account: 'https://michiel-is-not-available.herokuapp.com/ledger/accounts/admin', password: 'admin' }),
    new Plugin({ account: 'https://michiel-eur.herokuapp.com/ledger/accounts/admin', password: 'admin' }))

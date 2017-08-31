### dependencies
```js
const crypto = require('crypto')
const tweetnacl = require('tweetnacl')
const fetch = require('node-fetch')
const https = require('https')
```

### inputs from configuration
```js
const myHostname = 'wallet1.com'
const httpsOptions = { ... }
```

### inputs from out-of-band communication
```js
const peerHostname = 'wallet2.com'
const ledgerCurrency = '.usd.9.'
```

### STEP 1: generate your own key pair
```js
  const myPriv = crypto.createHmac('sha256', crypto.randomBytes(33)).update('CONNECTOR_ED25519')
  const myPub = tweetnacl.scalarMult.base(crypto.createHash('sha256').update(myPriv).digest())
```

### STEP 2: host your public key in your WebFinger record
```js
function serverWebFinger(httpsOptions, myHostname, myPub) {
  https.createServer( httpsOptions, (req, res) => {
    if (req.url.startsWith('/.well-known/webfinger') {
      res.end(JSON.stringify({
          subject: 'https://' + ownHostname,
          properties: {
            'https://interledger.org/rel/protocolVersion': `Compatible: ilp-kit v3.0.0`,
            'https://interledger.org/rel/publicKey': myPub.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
          },
          links:[
            { rel: 'https://interledger.org/rel/peersRpcUri', href: 'https://' + myHostname + '/rpc' }
          ]
        }
      }, null, 2))
    } else {
      // handle rpc call
    }
  }).listen(443)
}
```

### STEP 3: retrieve your peer's public key from their WebFinger record
```js
function(peerHostname) {
  return fetch('https://' + peerHostname + '/.well-known/webfinger?resource=https://' + peerHostname).then(response => {
    return response.json()
  }).then(webfingerRecord => 
    return Buffer.from(webfingerRecord.properties['https://interledger.org/rel/publicKey'], 'base64')
  })
}
```

### STEP4: calculate the peer ledger prefix
```js
function getLedgerPrefix(myPriv, peerPub, ledgerCurrency) {
  const ledgerNameBuff = crypto.createHmac('sha256', tweetnacl.scalarMult(
    crypto.createHash('sha256').update(toBuffer(myPriv)).digest(),
    peerPub)).update('token', 'ascii').digest()
  return 'peer.' + ledgerNameBuff.toString('base64').substring(0, 5).replace(/\+/g, '-').replace(/\//g, '_') + ledgerCurrency
}
```

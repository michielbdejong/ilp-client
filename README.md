# ilp-client
      cancelRoutesFor(ledger);
Common parts between [micmic](https://github.com/michielbdejong/micmic) and [connectorland](https://github.com/interledger/connector.land).

the really minimal server does:
* webfinger
* always respond to getPeerLimit with 0
* accept SPSP payments

# Usage

Server:

```js
var https = require('https');
var IlpNodeServer = require('ilp-node').Server;
var ilpNodeServer = new IlpNodeServer({
  dataDir: './data',
  acceptSpsp: true,
  keepRoutingTables: true,
  forwardPayments: false,
  respondToQuoteRequests: false,
  autoRebalance: false,
  peerTrustCurves: {
    'hive.dennisappelt.com': IlpNodeServer.blockPeg([10, 'USD']),
  }
});

// is there a reason for to ever refuse an spsp payment?
// initial configuration:
// * a data dir
// * it will take its domain name from requests
// * accept SPSP payments
// * take note of route broadcasts
// * don't forward payments
// * reject all quote requests
//
// if someone peers with you, add their routes with zero trust
// if *you* trust a peer, you probably also trust their routes,
// but initially, both trust forms are zero.
// initially the server will just start accepting spsp payments
// over trustlines people open to it.
// it starts trying to pay out to XRP
// and that way establish pegs for the trustlines it has
// payments will be based on route broadcasts, not quotes.

// to add trust to specific trustlines, as an admin, add it to the
// trustConfig. it should work as a curve:
// how much is a certain (positive) balance on that trustline worth to you?

// natively, it stores group legders in its data dir, and trust curves.

group ledger storage format:
* filename is the ledger prefix, .txt
* each line is an entry.
* each line is txid, timestamp, from, to, new-from-balance, new-to-balance (that way, you allow disputed transactions as well)
* authenticated rpc calls can influence the ledger, according to the API docs (basically, ilp-plugin-virtual's rpc calls, plus route broadcasts, plus webfinger)

its behavior should be specified in terms of strategies. default should be:
* always accept SPSP payments
* always respond to quote requests with best hop, no fee, generous message window
* broadcast routes

* use block-peg trust curves

var myIlpNodeServer = new IlpNodeServer({
  acceptPeer: () => 0,
  acceptSpspPayment: () => true,
 
});

https.createServer({
 // ... certificate options
}, myIlpNodeServer.handle).listen(443);
```

```sh
git clone https://github.com/michielbdejong/ilp-node
cd ilp-node
npm install
cp passwords.js-sample passwords.js
vim passwords.js
# put in the passwords for your accounts at ilp-kit hosts and other five-bells ledgers.
node test
```


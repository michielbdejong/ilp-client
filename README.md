# ilp-node (mj-xrp-to-xrp branch)

You can use the xrp-tester script, to send money to yourself over the XRP testnet. For that, use the XRP connector from https://testnet.connector.land/#/connectors
which acts as both an entry and an exit node. The address, secret, and server variables are from https://ripple.com/build/ripple-test-net/ (please get your own ones)

```sh
npm install
DEBUG=* CONNECTOR=test.crypto.xrp.rT1MJbVTB4eTsBNDCLQrQE88hK2XDf7dQ XRP_SECRET=sptEeUXpuz3PCm8y4NS73eUwmtSU6 XRP_SERVER=wss://s.altnet.rippletest.net:51233 PLUGIN=ilp-plugin-xrp-escrow node src/xrp-tester.js
```

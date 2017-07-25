# ilp-node
Common parts between [micmic](https://github.com/michielbdejong/micmic) and [connectorland](https://github.com/interledger/connector.land).

# Usage

```sh
git clone https://github.com/michielbdejong/ilp-node
cd ilp-node
npm install
cd examples/server-http
npm install
npm start
# Then open http://localhost:8001/stats?test=localhost:8002 in your browser
```

You can also use the xrp-tester script, to send money to yourself over the XRP testnet. For that, use the connector from https://testnet.connector.land/#/connectors
which acts as both an entry and an exit node. The address, secret, and server variables are from https://ripple.com/build/ripple-test-net/ (please get your own ones)

```sh
XRP_ADDRESS=rP2rY7QeTSKx4kmubbwuAXDACUVLMf7vWW CONNECTOR=test.crypto.xrp.rPpjQCZL3tzXPo4Qx8Fm7Pe5s1Xsa98cHg XRP_SECRET=sptEeUXpuz3PCm8y4NS73eUwmtSU6 XRP_SERVER=wss://s.altnet.rippletest.net:51233 PLUGIN=ilp-plugin-xrp-escrow node src/xrp-tester.js
```

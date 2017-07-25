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

```sh
XRP_ADDRESS=rptJXBtDGaRhtBbLJiRXuvxcNZmQitBz9P XRP_SECRET=ssy2Z7Fd9HA5ER3NqeyVYPMcHPJeC XRP_SERVER=wss://s.altnet.rippletest.net:51233 PLUGIN=ilp-plugin-xrp-escrow node src/xrp-to-xrp.js
```

In other window:
```sh
XRP_ADDRESS=rP2rY7QeTSKx4kmubbwuAXDACUVLMf7vWW CONNECTOR=rptJXBtDGaRhtBbLJiRXuvxcNZmQitBz9P XRP_SECRET=sptEeUXpuz3PCm8y4NS73eUwmtSU6 XRP_SERVER=wss://s.altnet.rippletest.net:51233 PLUGIN=ilp-plugin-xrp-escrow node src/xrp-tester.js
```

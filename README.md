# ilp-node
Common parts between [micmic](https://github.com/michielbdejong/micmic) and [connectorland](https://github.com/interledger/connector.land).

# Usage

First, choose if you want to run locally or hosted. If hosted, get a VPS with 2Gb of memory, and Docker installed (you can also do it without
Docker, if you just install geth and node, and then follow the same steps as [the geth-rinkeby Dockerfile](https://github.com/michielbdejong/geth-rinkeby-docker)).

Now, follow the [readme instructions](https://github.com/michielbdejong/geth-rinkeby-docker) to get geth-rinkeby running. You will have to create
your wallet and get it funded, but you don't need to compile/deploy a contract. You do need to create a second wallet, but that one will be the
receiver in your test transaction, so you don't have to fund it (you can only fund one account every 8 hours).

Once you have your two wallet addresses and secrets, you can use the eth-tester script
to send money to yourself over the ETH testnet. Use the connector for ETH from https://testnet.connector.land/#/connectors
which acts as both an entry and an exit node: [TODO: set up a connector and publish it there]

Make sure to use upper case hex alphabet for addresses (0123456789ABCDEF).

```sh
export DEBUG=*
export PROVIDER=http://geth:8545 # server where you run your https://github.com/michielbdejong/geth-rinkeby-docker instance
export ADDRESS1=0x596144741AC842BF4C5F976D01E5CA0E8B552963 # from geth-rinkeby-docker instructions
export SECRET1=xidaequeequuu4xah8Ohnoo1Aesumiech6tiay1 # from geth-rinkeby-docker instructions
export ADDRESS2=0xC3CBBF339554F26E591764AF8807F16242FE06A4 # from geth-rinkeby-docker instructions
export SECRET2=eekohj0Coosh7weet2iaX8odooh3Wahdeob8Awie # from geth-rinkeby-docker instructions
# export CONNECTOR=test.crypto.eth.rinkeby.0xC3CBBF339554F26E591764AF8807F16242FE06A4 # from https://testnet.connector.land/#connectors
export CONNECTOR=test.crypto.eth.rinkeby.0xC3CBBF339554F26E591764AF8807F16242FE06A4 # until connector has been set up, test same-ledger payment
node src/eth-tester.js
```

TODO:
* ssh into geth and set up a XRP+ETH connector there
* exchange rate 500 XRP = 1 ETH
* store kv in redis
* store deposits in redis and check them
* remove deposit if transaction times out
* document how to connect from xrp / from eth
* open RPC port for pay-from-balance
* sender-paychan
* receiver-paychan

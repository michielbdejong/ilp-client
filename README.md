# ilp-node
Common parts between [micmic](https://github.com/michielbdejong/micmic) and [connectorland](https://github.com/interledger/connector.land).

# Usage

First, choose if you want to run locally or hosted. If hosted, get a VPS with 2Gb of memory, and Docker installed (you can also do it without
Docker, if you just install geth and node, and then follow the same steps as [the geth-rinkeby Dockerfile](https://github.com/michielbdejong/geth-rinkeby-docker)).

Now, follow the [readme instructions](https://github.com/michielbdejong/geth-rinkeby-docker) to get geth-rinkeby running. You will have to create
your wallet and get it funded, but you don't need to compile/deploy a contract.

From those instructions, you will have your wallet address and secret, so you can now use the eth-tester script
to send money to yourself over the ETH testnet. Use the connector for ETH from https://testnet.connector.land/#/connectors
which acts as both an entry and an exit node: [TODO: set up a connector and publish it there]

```sh
export DEBUG=*
export PROVIDER=http://geth:8545 # server where you run your https://github.com/michielbdejong/geth-rinkeby-docker instance
export ADDRESS=0x596144741ac842bf4c5f976d01e5ca0e8b552963 # from geth-rinkeby-docker instructions
export SECRET=xidaequeequuu4xah8Ohnoo1Aesumiech6tiay1 # from geth-rinkeby-docker instructions
export CONNECTOR=test.crypto.eth.rinkeby.0x596144741ac842bf4c5f976d01e5ca0e8b552963 # from https://testnet.connector.land/#connectors
node src/eth-tester.js
```

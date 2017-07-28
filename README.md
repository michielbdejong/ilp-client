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

```
personal.unlockAccount('0x534B76F8528E5458EA58589426745D9FBCD794ED', 'jai1uNgee2shaikeepai7ca0chahQu7eilah5boo');personal.unlockAccount('0xB8EB3E2A6C5E41C27FE92ED28306590EA99CF13C', 'AhbeiQuie0ohshohshaa6kaew9mohMie1me9job3')
```

```sh
export DEBUG=*
export PROVIDER=http://localhost:8545 # server where you run your https://github.com/michielbdejong/geth-rinkeby-docker instance
export ADDRESS1=0x534B76F8528E5458EA58589426745D9FBCD794ED # from geth-rinkeby-docker instructions
export SECRET1=jai1uNgee2shaikeepai7ca0chahQu7eilah5boo # from geth-rinkeby-docker instructions
export ADDRESS2=0xB8EB3E2A6C5E41C27FE92ED28306590EA99CF13C # from geth-rinkeby-docker instructions
export SECRET2=AhbeiQuie0ohshohshaa6kaew9mohMie1me9job3 # from geth-rinkeby-docker instructions
# export CONNECTOR=test.crypto.eth.rinkeby.0x45A0C640B129E50C3DA474CAD9936DFD7D77868F # from https://testnet.connector.land/#connectors
export CONNECTOR=test.crypto.eth.rinkeby.0xB8EB3E2A6C5E41C27FE92ED28306590EA99CF13C
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

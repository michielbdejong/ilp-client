# ilp-node
Common parts between [micmic](https://github.com/michielbdejong/micmic) and [connectorland](https://github.com/interledger/connector.land).

# Usage

First, get a local geth node running, connected to the ethereum testnet: (TODO: see how to do this on heroku)
```sh
brew tap ethereum/ethereum
brew install ethereum
# for platforms other than MacOS, see https://github.com/ethereum/go-ethereum/wiki/Building-Ethereum
sh ./startGeth.sh
tail -f geth-testnet-node.log
```

Once it's synced up (will take in the order of one hour), create your ethereum account on the testnet:
```sh
pwgen 40 1
# eeDavou5diereed5ail3eeph0paighejae3ohwo8
/usr/local/bin/geth attach ipc:./geth-blocks-testnet/geth.ipc
> eth.accounts
[]
> personal.newAccount("eeDavou5diereed5ail3eeph0paighejae3ohwo8")
"0x2b080240e93a58504cda75339a5129c532cfff19"
> personal.unlockAccount("0x2b080240e93a58504cda75339a5129c532cfff19", "eeDavou5diereed5ail3eeph0paighejae3ohwo8")
```

Now go to https://www.rinkeby.io/ ('Crypto Faucet' option) to get some testnet-ether into that account (allowed once for each github user, resets every 8 hours).
Now, check your balance:

```sh
> web3.fromWei(eth.getBalance("0x2b080240e93a58504cda75339a5129c532cfff19"), "ether")
3
```

You can now use the eth-tester script, to send money to yourself over the ETH testnet. For that, use the connector from https://testnet.connector.land/#/connectors
which acts as both an entry and an exit node:

```sh
export DEBUG=*
export PROVIDER=http://geth:8545 # server where you run your https://github.com/michielbdejong/geth-rinkeby-docker instance
export ADDRESS=0x2b080240e93a58504cda75339a5129c532cfff19 # from personal.newAccount('eeDavou5diereed5ail3eeph0paighejae3ohwo8') above
export SECRET=eeDavou5diereed5ail3eeph0paighejae3ohwo8 # from pwgen 40 1 above
export CONNECTOR=test.crypto.eth.rinkeby.0x2b080240e93a58504cda75339a5129c532cfff19 # from https://testnet.connector.land/#connectors
node src/eth-tester.js
```

#!/bin/bash
# export GOPATH=/Users/michiel/go
#export PATH=$PATH:$GOPATH/bin
/usr/local/bin/geth --testnet --rpc --rpccorsdomain "*" --datadir ./geth-blocks-testnet 2>> ./geth-testnet-node.log


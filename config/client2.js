module.exports = {
  "clp": {
    "name": "a7f0e298941b772f5abc028d477938b6bbf56e1a14e3e4fae97015401e8ab372",
    "initialBalancePerPeer": 10000,
    "upstreams": [
      {
        "url": "ws://localhost:8000",
        "peerName": "upstream-of-client-2",
        "token": "ea16ed65d80fa8c760e9251b235e3d47893e7c35ffe3d9c57bd041200d1c0a50"
      }
    ]
  },
//  "eth": {
//    "secret": "koo5nae6ij0iiNga5koh4mahmoo9oom3iehohcoo",
//    "address": "0x85039B0EC7C8090FA375B065A3918AFDB1EF65F2",
//    "connector": "0x8B3FBD781096B51E68448C6E5B53B240F663199F",
//    "provider": "http://localhost:8545",
//    "contract": "0x8B3FBD781096B51E68448C6E5B53B240F663199F",
//    "prefix": "test.crypto.eth.rinkeby."
//  },
  "xrp": {
    "secret": "snWRByL1KRSSprArJJvxDaiJfujLC",
    "address": "rB1vPd6fnPZQUHmnxexfzXsUPdKKjfTQxQ",
    "connector": "rhjRdyVNcaTNLXp3rkK4KtjCdUd9YEgrPs",
    "server": "wss://s.altnet.rippletest.net:51233",
    "prefix": "test.crypto.xrp."
  }
}

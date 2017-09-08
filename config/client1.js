module.exports = {
  "clp": {
    "name": "9cba6c695c3b5da05cd76ddb9317194afbae4da7d67f2deb90380cf4b7e06fe4",
    "initialBalancePerPeer": 10000,
    "upstreams": [
      {
        "url": "ws://localhost:8000",
        "peerName": "upstream-of-client-1",
        "token": "0df891c5249e4239f42b36bf5dbff9d6808272ac9d33b272f81f7f1042088f74"
      }
    ]
  },
  "eth": {
    "secret": "ahd0mooGh3tai5Lae9quahth9Eerah6eiGhahgoh",
    "address": "0xECFA6A8999A67A498524EAAF5287417C4569C6DB",
    "connector": "0x8B3FBD781096B51E68448C6E5B53B240F663199F",
    "provider": "http://localhost:8545",
    "contract": "0x8B3FBD781096B51E68448C6E5B53B240F663199F",
    "prefix": "test.crypto.eth.rinkeby."
  },
  "xrp": {
    "secret": "ssGjGT4sz4rp2xahcDj87P71rTYXo",
    "address": "rrhnXcox5bEmZfJCHzPxajUtwdt772zrCW",
    "connector": "rhjRdyVNcaTNLXp3rkK4KtjCdUd9YEgrPs",
    "server": "wss://s.altnet.rippletest.net:51233",
    "prefix": "test.crypto.xrp."
  }
}

module.exports = {
  clp: {
    name: '95aa8969819714b50b7937ccd75a4cdf45d0a4707b79e7e23a7356e3f3902c3c',
    initialBalancePerPeer: 10000,
    upstreams: [ {
      url: 'ws://localhost:8000',
      peerName: 'ab833ece33938b2327b0d7ab78a28a39c498c9915e8ab05026d5400f0fa2da34',
      token: 'adc4b2c02c6ac27b36d7000969d4d6300fbc53e69e7fa136a017077c25a18d4e'
    } ]
  },
  eth: {
    secret: 'ahd0mooGh3tai5Lae9quahth9Eerah6eiGhahgoh',
    address: '0xecfa6a8999a67a498524eaaf5287417c4569c6db',
    connector: '0x8b3fbd781096b51e68448c6e5b53b240f663199f',
    prefix: 'test.crypto.eth.rinkeby.'
  },
  xrp: {
    secret: 'ssGjGT4sz4rp2xahcDj87P71rTYXo',
    address: 'rrhnXcox5bEmZfJCHzPxajUtwdt772zrCW',
    connector: 'rhjRdyVNcaTNLXp3rkK4KtjCdUd9YEgrPs',
    server: 'wss://s.altnet.rippletest.net:51233',
    prefix: 'test.crypto.xrp.'
  }
}

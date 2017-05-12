const protocols = {
  http: require('http'),
  https: require('https')
}

function Peer(host, tokenStore, peerPublicKey) {
  console.log('Peer', host, tokenStore, peerPublicKey)
  this.host = host
  this.protocol = protocols['https']
  if (host.split(':')[0] === 'localhost') {
    this.protocol = protocols['http'];
    [ this.host, this.port ] = host.split(':')
  }

  this.quoteId = 0
  this.peerPublicKey = peerPublicKey
  this.ledger = 'peer.' + tokenStore.getToken('token', peerPublicKey).substring(0, 5) + '.usd.9.';
  this.authToken = tokenStore.getToken('authorization', peerPublicKey)
  this.myPublicKey = tokenStore.peeringKeyPair.pub
}

Peer.prototype.newQuoteId = function () {
  var newQuoteId = new Date().getTime();
  while (newQuoteId < this.quoteId) {
    newQuoteId++;
  }
  this.quoteId = newQuoteId;
  return this.quoteId;
}

Peer.prototype.postToPeer = async function(method, postData) {
  const options = {
    host: this.host,
    port: this.port,
    path: `/api/peers/rpc?method=${method}&prefix=${this.ledger}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + this.authToken
    }
  }
  return await new Promise((resolve, reject) => {
    const req = this.protocol.request(options, (res) => {
      res.setEncoding('utf8')
      var str = ''
      res.on('data', (chunk) => {
        str += chunk
      })
      res.on('end', () => {
        resolve(str)
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify([ {
      ledger: this.ledger,
      from: this.ledger + this.myPublicKey,
      to: this.ledger + this.peerPublicKey,
      data: postData
    } ], null, 2))
    req.end()
  })
}

Peer.prototype.getQuote = function(destinationLedger) {
  return this.postToPeer('send_message', {
    method: 'quote_request',
    id: this.newQuoteId(),
    data: {
      source_amount: '10025',
      source_address: this.ledger + 'alice',
      destination_address: destinationLedger + 'bobby.tables',
      source_expiry_duration: '6000',
      destination_expiry_duration: '5'
    }
  })
}

Peer.prototype.pay = function(destinationLedger) {
  return this.postToPeer('send_transfer', {
     // ...
  })
}

Peer.prototype.getLimit = function() {
  return this.postToPeer('get_limit')
}

Peer.prototype.getBalance = function() {
  return this.postToPeer('get_balance')
}

Peer.prototype.announceRoute = async function(ledger, curve) {
  await this.postToPeer('send_message', {
    method: 'broadcast_routes',
    data: {
      new_routes: [ {
        source_ledger: this.ledger,
        destination_ledger: ledger,
        points: curve,
        min_message_window: 1,
        source_account: this.ledger + this.myPublicKey
      } ],
      hold_down_time: 45000,
      unreachable_through_me: []
    }
  })
}

Peer.prototype.handleRpc = async function(params, bodyObj) {
  switch(params.method) {
  case 'get_limit':
  case 'get_balance':
    return '0';
    break;
  case 'send_transfer':
    // TODO: try to fulfill SPSP payment, otherwise, try to forward
    break;
  case 'send_message':
    console.log('GOT MESSAGE!!', params, bodyObj);
    // reverse engineered from https://github.com/interledgerjs/ilp-plugin-virtual/blob/v15.0.1/src/lib/plugin.js#L152:
    if (Array.isArray(bodyObj) && bodyObj[0].data && bodyObj[0].data.method === 'broadcast_routes') {
      const newRoutes = bodyObj[0].data.data.new_routes
      for (var i=0; i<newRoutes.length; i++) {
        this.getQuote(newRoutes[i].destination_ledger);
      }
    }
    break;
  case 'quote_response':
     stats.hosts = hosts;
     stats.quotes.push(bodyObj[0].data.data);
     fs.writeFile('peering-stats.json', JSON.stringify(stats, null, 2));
    // 10|ilp-nod | CHUNK! [{"ledger":"peer.a1Mg_.usd.9.","from":"peer.a1Mg_.usd.9.Sk0gGc3mz9_Ci2eLTTBPfuMdgFEW3hRj0QTRvWFZBEQ","to":"peer.a1Mg_.usd.9.8Zq10b79NO7RGHgfrX4lCXPbhVXL3Gt63SVLRH-BvR0","data":{"id":1493113353887,"method":"quote_response","data":{"source_ledger":"peer.a1Mg_.usd.9.","destination_ledger":"us.usd.cornelius.","source_connector_account":"peer.a1Mg_.usd.9.Sk0gGc3mz9_Ci2eLTTBPfuMdgFEW3hRj0QTRvWFZBEQ","source_amount":"10025","destination_amount":"9","source_expiry_duration":"6000","destination_expiry_duration":"5","liquidity_curve":[[10.02004008016032,0],[100000000000000000,99799999999999.98]]}}}]
    break;
  default:
    return 'Unknown method';
  }
}

module.exports.Peer = Peer

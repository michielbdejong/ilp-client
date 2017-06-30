const protocols = {
  http: require('http'),
  https: require('https')
}

function Peer(host, tokenStore, hopper, peerPublicKey) {
  console.log('Peer', host, tokenStore, hopper, peerPublicKey)
  this.host = host
  this.rate = 1.0 // for now, all peers are in USD
  this.protocol = protocols['https']
  if (host.split(':')[0] === 'localhost') {
    this.protocol = protocols['http'];
    [ this.host, this.port ] = host.split(':')
  }
  this.quoteId = 0
  this.peerPublicKey = peerPublicKey
  console.log('getting token', peerPublicKey)
  this.ledger = 'peer.' + tokenStore.getToken('token', peerPublicKey).substring(0, 5) + '.usd.9.';
  this.authToken = tokenStore.getToken('authorization', peerPublicKey)
  this.myPublicKey = tokenStore.peeringKeyPair.pub
  this.routes = {}
  this.hopper = hopper
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
        console.log('rpc response!', postData, str)
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

Peer.prototype.requestQuote = function(destinationLedger) {
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

function applyCurve(curve, ret) {
  let given, wanted, givenAmount
  if (typeof ret[0] === undefined ) {
    wanted = 0
    given = 1
    givenAmount = ret[1]
  } else {
    wanted = 0
    given = 1
    givenAmount = ret[0]
  }
  // linear search:
  for (let i=1; i < curve.length; i++) {
    if (curve[i][given] == givenAmount) {
      ret[wanted] = curve[i][wanted]
      return ret 
    } else if (curve[i][given] > givenAmount) {
      let fraction = (givenAmount - curve[i-1][given]) / (curve[i][given] - curve[i-1][given])
      ret[wanted] = curve[i-1][wanted] + fraction * (curve[i][wanted] - curve[i-1][wanted])
      return ret
    }
  }
}

Peer.prototype.respondQuote = function(curve, quote) {
  [ quote.sourceAmount, quote.destinationAmount ]  = applyCurve(curve, [ quote.sourceAmount, quote.destinationAmount ])
  quote.liquidity_curve = curve
  return this.postToPeer('send_message', {
    method: 'quote_response',
    id: quote.id,
    data: quote
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
  case 'send_request':
  case 'send_message':
    console.log('GOT MESSAGE!!', params, bodyObj);
    // reverse engineered from https://github.com/interledgerjs/ilp-plugin-virtual/blob/v15.0.1/src/lib/plugin.js#L152:
    if (Array.isArray(bodyObj) && bodyObj[0].data) {
      switch(bodyObj[0].data.method) {
      case 'broadcast_routes':
        console.log('It is routes!')
        bodyObj[0].data.data.new_routes.map(route => {
          this.routes[route.destination_ledger] = route
        })
        console.log('new routes map', Object.keys(this.routes))
        // always quote directly after receiving a new route, to determine whether this connector charges gratuity:
        // this.requestQuote(newRoutes[i].destination_ledger)
        break
      case 'quote_request':
        const curve = this.hopper.makeCurve(this.host, bodyObj[0].data.data.destination_ledger)
        if (curve === undefined) {
          // todo: implement remote quoting
        } else {
          this.respondQuote(curve, bodyObj[0].data.data)
        }
        break
      case 'quote_response':
        // todo: calculate gratuity compared to route
        break;
      default:
        console.error('Unknown message method', bodyObj[0].data.method)
      }
    }
    break;
  default:
    return 'Unknown method';
  }
}

// Peer.prototype.respondQuote(quote) {
  
module.exports.Peer = Peer

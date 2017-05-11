var quoteId = 0;
function newQuoteId() {
  var newQuoteId = new Date().getTime();
  while (newQuoteId < quoteId) {
    newQuoteId++;
  }
  quoteId = newQuoteId;
  return quoteId;
}

function postToPeer(host, postDataFn, cb) {
  getPeerPublicKey(host, (err, peerPublicKey) => {
    if (err) {
      console.error(err);
      return;
    }
    var ledger = 'peer.' + makeToken('token', peerPublicKey).substring(0, 5) + '.usd.9.';
    hosts[ledger] = host;
    console.log({ err, ledger });
    var postData = postDataFn(ledger);
    var options = {
      host,
      path: `/api/peers/rpc?method=send_message&prefix=${ledger}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + makeToken('authorization', peerPublicKey)
      },
    };
    console.log('making request!', options, postData);
    var req = https.request(options, (res) => {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
      res.setEncoding('utf8');
      var str = '';
      res.on('data', (chunk) => {
        str += chunk;
      });
      res.on('end', () => {
        cb(null, str);
      });
    });
    req.on('error', cb);
    req.write(JSON.stringify([ {
      ledger,
      from: ledger + keypair.pub,
      to: ledger + peerPublicKey,
      data: postData
    } ], null, 2));
    req.end();
  });
}

function getQuote(host, destinationLedger) {
  console.log('quoting on new route!', host, destinationLedger);
  postToPeer(host, ledger => {
    return {
      method: 'quote_request',
      id: newQuoteId(),
      data: {
        source_amount: '10025',
        source_address: ledger + 'alice',
        destination_address: destinationLedger + 'bobby.tables',
        source_expiry_duration: '6000',
        destination_expiry_duration: '5'
      }
    };
  }, function (err, res) { console.log('requested a quote', err, res) });
}

function pay(host, destinationLedger) {
  console.log('paying bobby', host, destinationLedger);
  postToPeer(host, ledger => {
    return {
      method: 'send_transfer',
      id: newQuoteId(),
      data: {
        source_amount: '10025',
        source_address: ledger + 'alice',
        destination_address: destinationLedger + 'bobby.tables',
        source_expiry_duration: '6000',
        destination_expiry_duration: '5'
      }
    };
  }, function (err, res) { console.log('requested a quote', err, res) });
}

function handleRpc(params, bodyObj) {
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
      console.log('its routes!', bodyObj[0].data.data);
      postToPeer('ilp-kit.michielbdejong.com', ledger => {
        return {
          method: 'broadcast_routes',
          data: {
            new_routes: [ {
              source_ledger: ledger,
              destination_ledger: 'g.mylp.longplayer.',
              points: [
                [1e-12,0],
                [100000000000000000, 11009463495575220000]
              ],
              min_message_window: 1,
              source_account: ledger + keypair.pub
            } ],
            hold_down_time: 45000,
            unreachable_through_me: []
          }
        };
      }, function (err, res) { console.log('announced my own route', err, res) });
      var newRoutes = bodyObj[0].data.data.new_routes;
      for (var i=0; i<newRoutes.length; i++) {
        getQuote('ilp-kit.michielbdejong.com', newRoutes[i].destination_ledger);
      }
    }
    break;
  case 'quote_response':
    console.log('QUOTE RESPONSE!', bodyObj[0].data.data.destination_ledger);
     stats.hosts = hosts;
     stats.quotes.push(bodyObj[0].data.data);
     fs.writeFile('peering-stats.json', JSON.stringify(stats, null, 2));
    // 10|ilp-nod | CHUNK! [{"ledger":"peer.a1Mg_.usd.9.","from":"peer.a1Mg_.usd.9.Sk0gGc3mz9_Ci2eLTTBPfuMdgFEW3hRj0QTRvWFZBEQ","to":"peer.a1Mg_.usd.9.8Zq10b79NO7RGHgfrX4lCXPbhVXL3Gt63SVLRH-BvR0","data":{"id":1493113353887,"method":"quote_response","data":{"source_ledger":"peer.a1Mg_.usd.9.","destination_ledger":"us.usd.cornelius.","source_connector_account":"peer.a1Mg_.usd.9.Sk0gGc3mz9_Ci2eLTTBPfuMdgFEW3hRj0QTRvWFZBEQ","source_amount":"10025","destination_amount":"9","source_expiry_duration":"6000","destination_expiry_duration":"5","liquidity_curve":[[10.02004008016032,0],[100000000000000000,99799999999999.98]]}}}]
    break;
  default:
    return 'Unknown method';
  }
}

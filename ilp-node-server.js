var http = require('http');
var https = require('https');
var fs = require('fs');
var crypto = require('crypto');

// include hardcoded tweetnacl dependency:
const tweetnacl = require('tweetnacl');

// include hardcoded base64url dependency;
function fromBase64(base64) {
  return base64
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function base64url(input) {
  if (Buffer.isBuffer(input)) {
      return fromBase64(input.toString("base64"));
  }
  return fromBase64(new Buffer(input, 'utf-8').toString("base64"));
}
function padString(input) {
    var segmentLength = 4;
    var stringLength = input.length;
    var diff = stringLength % segmentLength;
    if (!diff) {
        return input;
    }
    var position = stringLength;
    var padLength = segmentLength - diff;
    var paddedStringLength = stringLength + padLength;
    var buffer = new Buffer(paddedStringLength);
    buffer.write(input);
    while (padLength--) {
        buffer.write("=", position++);
    }
    return buffer.toString();
}
function toBase64(base64url) {
    base64url = base64url.toString();
    return padString(base64url)
        .replace(/\-/g, "+")
        .replace(/_/g, "/");
}
function toBuffer(base64url) {
    return new Buffer(toBase64(base64url), "base64");
}
// end base64url

var stats = fs.readFileSync('../data/stats.json');

var hosts = {};

const WEBFINGER_PREFIX = '/.well-known/webfinger?resource=';
const WEBFINGER_PREFIX_LENGTH =  WEBFINGER_PREFIX.length;

var quoteId = 0;
function newQuoteId() {
  var newQuoteId = new Date().getTime();
  while (newQuoteId < quoteId) {
    newQuoteId++;
  }
  quoteId = newQuoteId;
  return quoteId;
}

var keypair;
try {
  keypair = JSON.parse(fs.readFileSync('keyPair'));
  console.log('read keypair');
} catch(e) {
  keypair = {
    priv: crypto.createHmac('sha256', base64url(crypto.randomBytes(33))).update('CONNECTOR_ED25519').digest('base64'),
  };
  keypair.pub = base64url(tweetnacl.scalarMult.base(
    crypto.createHash('sha256').update(toBuffer(keypair.priv)).digest()
  ));
  fs.writeFileSync('keyPair', JSON.stringify(keypair, null, 2));
  console.log('wrote keypair');
}

var tokens = {
  token: {},
  authorization: {},
};

function makeToken(input, peerPublicKey) {
  return tokens[input][peerPublicKey] || (tokens[input][peerPublicKey] = base64url(crypto.createHmac('sha256', tweetnacl.scalarMult(
    crypto.createHash('sha256').update(toBuffer(keypair.priv)).digest(),
    toBuffer(peerPublicKey)
  )).update(input, 'ascii').digest()));
}

var spspSecret;

function getSpspSecret() {
  return spspSecret || (spspSecret = base64url(crypto.randomBytes(16)));
}

function getPeerPublicKey(hostname, callback) {
  console.log('getting peer public key', hostname);
  https.get({
    hostname,
    path: '/.well-known/webfinger?resource=https://' + hostname,
  }, (res) => {
    var body = '';
    res.on('data', chunk => {
      body += chunk;
    });
    res.on('end', () => {
      // {"subject":"https://ilp-kit.michielbdejong.com","properties":{"https://interledger.org/rel/publicKey":"Sk0gGc3mz9_Ci2eLTTBPfuMdgFEW3hRj0QTRvWFZBEQ","https://interledger.org/rel/protocolVersion":"Compatible: ilp-kit v2.0.0-alpha"},"links":[{"rel":"https://interledger.org/rel/ledgerUri","href":"https://ilp-kit.michielbdejong.com/ledger"},{"rel":"https://interledger.org/rel/peersRpcUri","href":"https://ilp-kit.michielbdejong.com/api/peers/rpc"},{"rel":"https://interledger.org/rel/settlementMethods","href":"https://ilp-kit.michielbdejong.com/api/settlement_methods"}]}
      try {
        callback(null, JSON.parse(body).properties['https://interledger.org/rel/publicKey']);
      } catch (e) {
console.log(e);
        callback(e);
      }
    });
  });
}

function webfingerRecord (host, resource) {
  host = 'https://stats.connector.land';
  var ret = {
    subject: resource
  };
  console.log({ host, resource })
  if ([host, 'https://'+host, 'http://'+host].indexOf(resource) !== -1) { // host
    ret.properties = {
     'https://interledger.org/rel/publicKey': keypair.pub,
     'https://interledger.org/rel/protocolVersion': 'Compatible: ilp-kit v2.0.0-alpha'
    };
    ret.links = [
     { rel: 'https://interledger.org/rel/peersRpcUri', href: resource + '/rpc' },
    ];
  } else { // user
    ret.links = [
     { rel: 'https://interledger.org/rel/spsp/v2', href: host + '/spsp?' + resource },
     // following two are because of ilp-kit bug:
     { rel: 'https://interledger.org/rel/ledgerUri', href: '' },
     { rel: 'https://interledger.org/rel/ilpAddress', href: '' },
    ];
  }
  console.log('WebFinger response', resource, ret);
  return JSON.stringify(ret, null, 2);
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

// function handleSpsp(acct) {
//   return 'not implemented yet';
// }
// 
// function listen = function(port) {
//   var server = http.createServer(function(req, res) {
//         res.end(handleSpsp(req.url.substring('/spsp/acct:'.length).split('@')));
//       }
//     }
//   });
//   server.listen(port);
// };

console.log('starting server!')
http.createServer(function(req, res) {
  console.log(req.method, req.url, req.headers);
  var str = '';
  req.on('data', function(chunk) {
    console.log('CHUNK!', chunk.toString('utf-8'));
    str += chunk;
  });
  
  if (req.url.substring(0, WEBFINGER_PREFIX_LENGTH) === WEBFINGER_PREFIX) {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    });
    res.end(webfingerRecord(req.headers.host, req.url.substring(WEBFINGER_PREFIX_LENGTH)));
  } else {
    parts = req.url.split('?');
    if (parts[0] === '/rpc') {
      var params = {};
      parts[1].split('&').map(str => str.split('=')).map(arr => { params[arr[0]] = arr[1]; });
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      });
      console.log('WILL HANDLE AS RPC WHEN REQ ENDS')
      req.on('end', function() {
        console.log('req ended')
        res.end(handleRpc(params, JSON.parse(str)));
      });
    } else if (parts[0] === '/spsp') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      });
      var result = {
        destination_account: `g.mylp.longplayer.${parts[1]}`,
        shared_secret: getSpspSecret(),
        maximum_destination_amount: '18446744073709552000',
        minimum_destination_amount: '1',
        ledger_info: {
          currency_code: 'USD',
          currency_scale: 9
        },
        receiver_info: {
          name: parts[1],
          image_url: 'http://barton.canvasdreams.com/~jaderiyg/wp-content/uploads/2014/01/r679226_5007507.jpg'
        }
      };
      console.log({ result });
      res.end(JSON.stringify(result, null, 2));
    } else {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      });
      res.end(stats);
    }
  }
}).listen(6000);

var http = require('http');
var https = require('https');
var fs = require('fs');
var stats = fs.readFileSync('../data/stats.json');

var crypto = require('crypto');
const tweetnacl = require('tweetnacl');
const base64url = require('base64url');

const WEBFINGER_PREFIX = '/.well-known/webfinger?resource=';
const WEBFINGER_PREFIX_LENGTH =  WEBFINGER_PREFIX.length;

var keypair;
try {
  keypair = JSON.parse(fs.readFileSync('keyPair'));
  console.log('read keypair');
} catch(e) {
  keypair = {
    priv: crypto.createHmac('sha256', base64url(crypto.randomBytes(33))).update('CONNECTOR_ED25519').digest('base64'),
  };
  keypair.pub = base64url(tweetnacl.scalarMult.base(
    crypto.createHash('sha256').update(base64url.toBuffer(keypair.priv)).digest()
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
    crypto.createHash('sha256').update(base64url.toBuffer(keypair.priv)).digest(),
    base64url.toBuffer(peerPublicKey)
  )).update(input, 'ascii').digest()));
}

var spspSecret;

function getSpspSecret() {
  return spspSecret || (spspSecret = base64url(crypto.randomBytes(16)));
}

function getPeerPublicKey(hostname, callback) {
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
    getPeerPublicKey('ilp-kit.michielbdejong.com', (err, peerPublicKey) => {
      if (err) {
        console.error(err);
        return;
      }
      var ledger = 'peer.' + makeToken('token', peerPublicKey).substring(0, 5) + '.usd.9.';
      console.log({ err, ledger });
      var options = {
        host: 'ilp-kit.michielbdejong.com',
        path: `/api/peers/rpc?method=send_message&prefix=${ledger}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + makeToken('authorization', peerPublicKey)
        },
      };
      var postData = [ {
        ledger,
        from: ledger + keypair.pub,
        to: ledger + peerPublicKey,
        data: {
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
        }
      } ];
      console.log('making request!', options, postData);
      var req = https.request(options, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          console.log(`BODY: ${chunk}`);
        });
        res.on('end', () => {
          console.log('No more data in response.');
        });
      });
      
      req.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
      });
      req.write(JSON.stringify(postData, null, 2));
      req.end();
    });
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
  req.on('data', function(chunk) {
    console.log('CHUNK!', chunk.toString('utf-8'));
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
      res.end(handleRpc(params));
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

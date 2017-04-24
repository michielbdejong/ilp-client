var http = require('http');
var fs = require('fs');
var stats = fs.readFileSync('../data/stats.json');

var crypto = require('crypto');
const tweetnacl = require('tweetnacl');
const base64url = require('base64url');

const WEBFINGER_PREFIX = '/.well-known/webfinger?resource=';
const WEBFINGER_PREFIX_LENGTH =  WEBFINGER_PREFIX.length;

var keypair; // TODO: persist this to disk inbetween restarts

function getPubKey() {
  if (!keypair) {
    keypair = {
      priv: crypto.createHmac('sha256', base64url(crypto.randomBytes(33))).update('CONNECTOR_ED25519').digest('base64'),
    };
    keypair.pub = base64url(tweetnacl.scalarMult.base(
      crypto.createHash('sha256').update(base64url.toBuffer(keypair.priv)).digest()
    ));
  }
  return keypair.pub;
}

var spspSecret;

function getSpspSecret() {
  return spspSecret || (spspSecret = crypto.randomBytes(33).toString('hex'));
}

function webfingerRecord (host, resource) {
  host = 'https://stats.connector.land';
  var ret = {
    subject: resource
  };
  console.log({ host, resource })
  if ([host, 'https://'+host, 'http://'+host].indexOf(resource) !== -1) { // host
    ret.properties = {
     'https://interledger.org/rel/publicKey': getPubKey(),
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

http.createServer(function(req, res) {
  console.log(req.method, req.url, req.headers);
  req.on('data', function(chunk) {
    console.log('CHUNK!', chunk.toString('utf-8'));
  });
  
  if (req.url.substring(0, WEBFINGER_PREFIX_LENGTH) === WEBFINGER_PREFIX) {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*'
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
          currency_code: 'UCR',
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

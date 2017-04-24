var http = require('http');
var crypto = require('crypto');
const tweetnacl = require('tweetnacl');
const base64url = require('base64url');

const WEBFINGER_PREFIX = '/.well-known/webfinger?resource=';
const WEBFINGER_PREFIX_LENGTH =  WEBFINGER_PREFIX.length;


const generateSecret = (secret, name) => {
}
const publicKey = (seed) => {
  // seed should be a base64url string
  const seedBuffer = base64url.toBuffer(seed)

}

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

function webfingerRecord (host, resource) {
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
     { rel: 'https://interledger.org/rel/spsp/v2', href: host + '/spsp/' + resource },
    ];
  }
  return JSON.stringify(ret, null, 2);
}

function handleRpc(params, bodyObj) {
  switch(params[method]) {
  case 'getLimit':
  case 'getBalance':
    return '0';
    break;
  case 'sendTransfer':
    // TODO: try to fulfill SPSP payment, otherwise, try to forward
    break;
  default:
    return 'Unknown method';
  }
}

function handleSpsp(acct) {
  return 'not implemented yet';
}

module.exports.listen = function(port) {
  var server = http.createServer(function(req, res) {
    if (req.url.substring(0, WEBFINGER_PREFIX_LENGTH) === WEBFINGER_PREFIX) {
      res.end(webfingerRecord(req.headers.host, req.url.substring(WEBFINGER_PREFIX_LENGTH)));
    } else {
      parts = req.url.split('?');
      if (parts[0] === '/rpc') {
        var params = {};
        parts[1].split('&').map(str => str.split('=')).map(arr => { params[arr[0]] = arr[1]; });
        res.end(handleRpc(params));
      } else {
        res.end(handleSpsp(req.url.substring('/spsp/acct:'.length).split('@')));
      }
    }
  });
  server.listen(port);
};

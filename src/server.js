var http = require('http');

const WEBFINGER_PREFIX = '/.well-known/webfinger?resource=';
const WEBFINGER_PREFIX_LENGTH =  WEBFINGER_PREFIX.length;

function getPubKey() {
  return 'Sk0gGc3mz9_Ci2eLTTBPfuMdgFEW3hRj0QTRvWFZBEQ';
}

function webfingerRecord (host, resource) {
  var ret = {
    subject: resource
  };
  if (resource === host) { // host
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

module.exports.listen = function(port) {
  var server = http.createServer(function(req, res) {
    if (req.url.substring(0, WEBFINGER_PREFIX_LENGTH) === WEBFINGER_PREFIX) {
      res.end(webfingerRecord(req.headers.host, req.url.substring(WEBFINGER_PREFIX_LENGTH)));
    } else {
      res.end(req.url);
    }
  });
  server.listen(port);
};

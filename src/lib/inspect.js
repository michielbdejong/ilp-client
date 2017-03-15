var fs = require('fs');
var ping = require('ping');
var https = require('https');
var request = require('request-promise-native');

var rateCache;
var ledgerCurrency = {};
var connectorLedger = {};

function timedPromise(executor, timeout) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error('timeout'));
    }, timeout);
    executor(resolve, reject);
  });
}

function pingHost(hostname) {
  return timedPromise(resolve => {
    ping.sys.probe(hostname, resolve);
  }).then(isAlive => {
    return (isAlive ? 1 : 0);
  }, () => {
    return 0;
  });
}

function getHealth(hostname) {
  return request(`https://${hostname}/api/health`).then(str => {
    return (str === 'OK' ? 1 : 0);
  }, () => {
    return 0;
  });
}

function getLedgerInfo(ledgerUri) {
   // console.log('requesting', ledgerUri);
  return request({
    uri: ledgerUri,
    json: true,
  }).then(obj => {
    // set a rate for this ledger
    return obj;
  });
}

function getCurrencyRates() {
  if (typeof rateCache === 'object') {
    return Promise.resolve(rateCache);
  }
  return request({
    uri: 'https://api.fixer.io/latest',
    json: true,
  }).then(body => {
    if (typeof body === 'object' && typeof body.rates === 'object') {
      body.rates.EUR = 1.0000;
      return body.rates;
    }
    return {
      EUR: 1.0000,
      AUD: 1.3968,
      BGN: 1.9558,
      BRL: 3.3151,
      CAD: 1.4193,
      CHF: 1.0702,
      CNY: 7.2953,
      CZK: 27.021,
      DKK: 7.4335,
      GBP: 0.86753,
      HKD: 8.1982,
      HRK: 7.4213,
      HUF: 310.7,
      IDR: 14145,
      ILS: 3.8879,
      INR: 70.496,
      JPY: 120.65,
      KRW: 1216.4,
      MXN: 20.713,
      MYR: 4.7082,
      NOK: 8.9513,
      NZD: 1.5219,
      PHP: 53.198,
      PLN: 4.313,
      RON: 4.5503,
      RUB: 61.757,
      SEK: 9.5223,
      SGD: 1.4947,
      THB: 37.236,
      TRY: 3.9434,
      USD: 1.0556,
      ZAR: 13.791,
    };
  }).then(rates => {
    rateCache = rates;
    return rates;
  });
}

function prefixToCurrency(prefix) {
  var parts = prefix.split('.');
  var str = '';
  for (var i=0; i<parts.length; i++) {
    str += parts[i] + '.';
    if (ledgerCurrency[str]) {
      return ledgerCurrency[str];
    }
  }
  // console.warn('WARNING! Currency not found for prefix', prefix);
  return 'EUR';
}

function exchangeRate(fromConn, toLedger) {
  if (typeof rateCache !== 'object') {
    // console.warn('WARNING! Rate cache empty');
    return 'EUR';
  }
  var from = prefixToCurrency(fromConn);
  var to = prefixToCurrency(toLedger);
  // if from === EUR and to === USD, this returns:
  //              1.0000 / 1.0556
  // so it's the expected source amount if fee is zero.
  // console.log('exchangeRate', fromConn, toLedger, from, to, rateCache[from], rateCache[to], rateCache[from] / rateCache[to]);
  return rateCache[from] / rateCache[to];
}

function checkUrl(i, path) {
  return new Promise((resolve) => {
    var request = https.request({
      hostname: hostsArr[i].hostname,
      port:443,
      path: path,
      method: 'GET'
    }, function(response) {
      var str = '';
      response.on('data', function (chunk) {
        str += chunk;
      });

      response.on('end', function () {
        resolve({ status: response.statusCode, body: str });
      });
    });
    request.setTimeout(10000, function(err) {
      resolve({ error: 'Timed out' });
    });
    request.on('error', function(err) {
      resolve({ error: 'Connection error' });
    });
    request.end();
  });
}

function checkApiCall(i, field, path, print) {
  return checkUrl(i, path).then((result) => {
    if (result.error) {
        return `<span style="color:red">${result.error}</span>`;
    } else if (result.status === 200) {
      return print(result.body);
    } else {
      return `HTTP <span style="color:red">${result.status}</span> response`;
    }
  }).then(text => {
    hostsArr[i][field] = text;
  });
}

function checkHealth(i) {
  return checkApiCall(i, 'health', '/api/health', function(body) {
    return body;
  });
}

function getHostInfo(hostname) {
  var ret = {};
  return Promise.all([
    getWebFinger(hostname).then(obj => { ret = Object.assign(ret, obj); }, () => {}),
    getHealth(hostname).then(val => { ret.health = val; }, () => {}),
    pingHost(hostname).then(val => { ret.ping = val; }, () => {}),
  ]).then(() => {
    return ret;
  });
}

function getWebFinger(hostname) {
  return request({
    uri: `https://${hostname}/.well-known/webfinger?resource=https://${hostname}`,
    json: true,
  }).then(body => {
    var ret = {
      protocolVersion: body.properties['https://interledger.org/rel/protocolVersion'],
      publicKey: body.properties['https://interledger.org/rel/publicKey'],
    };
    body.links.map(link => {
      switch (link.rel) {
      case 'https://interledger.org/rel/ledgerUri': ret.ledgerUri = link.href; break;
      case 'https://interledger.org/rel/peersRpcUri': ret.peersRpcUri = link.href; break;
      case 'https://interledger.org/rel/settlementMethods': ret.settlementMethods = link.href; break;
      default: // ...
      };
    });
    return ret;
  });
}

function getApiVersion(i) {
  return new Promise((resolve) => {
    wf.lookup('https://'+hostsArr[i].hostname, function(err, result) {
      if (err) {
        resolve(`<span style="color:red">WebFinger error</span>`);
        return;
      }
      var version
      try {
        version = result.object.properties['https://interledger.org/rel/protocolVersion'];
      } catch(e) {
        resolve(`<span style="color:red">WebFinger properties missing</span>`);
        return;
      }
      if (typeof version === 'string') {
        resolve(`<span style="color:green">${version}</span>`);
      } else {
        resolve(JSON.stringify(version));
      }
    });
  }).then(text => {
    hostsArr[i].version = text;
  });
}

function checkSettlements(i) {
  return checkApiCall(i, 'settlements', '/api/settlement_methods', function(body) {
    var methods
    try {
      methods = JSON.parse(body);
      if (methods.length === 0) {
        return 'None';
      }
      return '<span style="color:green">' +
        methods.map(obj => obj.name).join(', ') +
        '</span>';
    } catch(e) {
      return '<span style="color:red">Unparseable JSON</span>';
    }
  });
}

function printScale(s) {
  const scales = {
    1: 'deci',
    2: 'centi',
    3: 'milli',
    6: 'micro',
    9: 'nano',
  };
  if (scales[s]) {
    return scales[s];
  }
  return `(10^-${s})`;
}

function checkLedger(i) {
  return checkUrl(i, '/ledger').then(result => {
    if (result.error) {
        hostsArr[i].maxBalance = `<span style="color:red">?</span>`;
        hostsArr[i].prefix = `<span style="color:red">?</span>`;
        return;
    }
    if (result.status === 200) {
      var data;
      try {
        data = JSON.parse(result.body);
      } catch(e) {
        hostsArr[i].maxBalance = `<span style="color:red">?</span>`;
        hostsArr[i].prefix = `<span style="color:red">?</span>`;
        return;
      }

      ledgerCurrency[data.ilp_prefix] = data.currency_code;

      hostsArr[i].prefix = data.ilp_prefix;
      hostsArr[i].maxBalance = `10^${data.precision} ${printScale(data.scale)}-${data.currency_code}`;
      var recipients = (extraConnectors[hostsArr[i].hostname] || []).concat(data.connectors.map(obj =>  obj.name));
      recipients.map(name => {
        connectorLedger[hostsArr[i].prefix + name] = hostsArr[i].prefix;
      });
      recipients.push('connectorland');

      return msgToSelf.test(hostsArr[i].hostname, hostsArr[i].prefix, recipients, destinations).then(result => {
        // {
        //   connectSuccess: true,
        //   connectTime: 4255,
        //   sendResults: {
        //     'kr.krw.interledgerkorea.connector': 'could not send',
        //     'kr.krw.interledgerkorea.connectorland': 987,
        //   },
        //   quoteResults: {
        //     'kr.krw.interledgerkorea.': 'no data',
        //   ,}
        // }
        // console.log('results are in:', hostsArr[i].hostname, hostsArr[i].prefix, recipients, destinations, result); 
        hostsArr[i].messaging = (result.connectSuccess ? result.connectTime : 'fail');
        hostsArr[i].messageToSelf = result.sendResults[hostsArr[i].prefix + 'connectorland'];
        for (var addr in result.sendResults) {
          if (addr !== hostsArr[i].prefix + 'connectorland') {
            connectors[addr] = {
              sendResults: result.sendResults[addr],
              quoteResults: result.quoteResults[addr],
            };
          }
        }
      }, err => {
        // console.log('error msgToSelf', i, err);
        if ([ // hosts on which connectorland has no account:
          'grifiti.web-payments.net',
        ].indexOf(hostsArr[i].hostname) === -1) {
          process.exit(1);
        }
        hostsArr[i].messaging = 'no data';
      });
    }
  }).then(() => {
  });
}

function pingHost(i) {
  return new Promise((resolve) => {
    ping.sys.probe(hostsArr[i].hostname, function(isAlive){
      hostsArr[i].ping = isAlive;
      resolve();
    });
  });
}

function integer(num) {
  return Math.floor(num + .5);
}

function percentage(num) {
  const DIGITS_FACTOR = 1000;
  var numDigits = integer(num * 100 * DIGITS_FACTOR);
  return `${numDigits / DIGITS_FACTOR}%`;
}

function fee(price, baseValue) {
  if (typeof price !== 'number') {
    return price;
  }
  var paidExtra = price - baseValue;
  // console.log('fee', price, baseValue, percentage(paidExtra / baseValue));
  return percentage(paidExtra / baseValue);
}

module.exports = {
  getHostInfo,
  getLedgerInfo,
};

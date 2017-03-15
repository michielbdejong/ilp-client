// ilp-node requires a cache file to function optimally.
// you should initialize it with credentials for hosts
// it will then keep track of health of these hosts, their ledgers, and their connectors.
// you can also specify extra connectors
// the health tracking consists of:
// * checking on startup
// * checking each hour
// the cache file is updated on each check
//
var Plugin = require('ilp-plugin-bells');  // TODO: allow other ledger types
var cryptoHelper = require('ilp/src/utils/crypto');
var cc           = require('ilp/src/utils/condition');
var uuidV4 = require('uuid/v4');
var crypto = require('crypto');

var inspect = require('./lib/inspect');
var rates = require('./lib/rates');

function Client(credentials) {
  if (typeof credentials !== 'object') {
    throw new Error(`Please construct as new Client({ 'example.com': { user: 'foo', password: 'bar' } });`);
  }
  this.credentials = credentials;
  ['hosts', 'ledgerInfo',  'ledger2host', 'plugins', 'fulfillments', 'balances', 'messaging', 'rates', 'quoteRequests', 'pending'].map(field => {
    this[field] = {};
  });
}

Client.prototype = {
  init() {
    var promise = [];
    return Promise.all(Object.keys(this.credentials).map(host => {
      return inspect.getHostInfo(host).then(obj => {
        this.hosts[host] = obj;
        return this.initLedger(host);
      }).then(ledger => {
        return this.msgToSelf(ledger);
      }).catch(err => {
        // console.log('Error initializing ledger for', host, err);
      });
    }));
  },
  msgToSelf(ledger) {
    // console.log('got username', ledger, this.ledger2host[ledger], this.credentials[this.ledger2host[ledger]]);
    var account = this.credentials[this.ledger2host[ledger]].user;
    var startTime = new Date().getTime();
    return this.getQuote({
      ledger,
      account,
    }, {}, account, 7000, 10000).then(() => {
      this.messaging[ledger] = new Date().getTime() - startTime;
    }, () => {
      this.messaging[ledger] = Infinity;
    });
  },
  initLedger(host) {
    var ledgerUri = this.hosts[host].ledgerUri;
    if (typeof ledgerUri !== 'string') {
      // console.log('skipping initLedger', host, this.hosts[host]);
      return Promise.resolve();
    }
    var ledger;
    return inspect.getLedgerInfo(ledgerUri).then(ledgerInfo => {
      ledger = ledgerInfo.ilp_prefix;
      this.ledgerInfo[ledger] = ledgerInfo;
      this.ledger2host[ledger] = host;
      // console.log('calling initPlugin', ledger);
      return this.initPlugin(ledger).then(() => {
        return this.plugins[ledger].getBalance();
      }).then(balance => {
        this.balances[ledger] = balance;
        return this.msgToSelf(ledger);
      }).then(() => {
        return this.getRate(ledger);
      }).then(() => {
        return this.initConnectors(ledger);
      }).then(() => {
        return ledger;
      });
    });
  },
  initConnectors(ledger) {
    // console.log('getting connectors', ledger, this.ledgerInfo);
    var defaultConnectors = this.ledgerInfo[ledger].connectors.map(obj => obj.name);
    var extraConnectors = ['micmic'];
    defaultConnectors.concat(extraConnectors).map(conn => {
      // ...
    });
  },
  getConnectors(ledger) {
    // console.log('getting connectors', ledger, this.ledgerInfo);
    return this.ledgerInfo[ledger].connectors.map(obj => obj.name).concat('micmic');
  },
  getRate(ledger) {
    return rates.getRate(this.ledgerInfo[ledger].currency_code).then(rate => {
      this.rates[ledger] = rate;
    });
  },
  initPlugin(ledger) {
    var credentials = this.credentials[this.ledger2host[ledger]];
    // console.log('getting plugin for', ledger, credentials);
    this.plugins[ledger] = new Plugin({
      ledger,
      account: `https://${this.ledger2host[ledger]}/ledger/accounts/${credentials.user}`,
      password: credentials.password,
    });
    return this.plugins[ledger].connect({ timeout: 10000 }).then(() => {
      return this.setListeners(ledger);
    }, err => {
      // console.log('could not connect to', this.ledger2host[ledger], ledger, err);
    });
  },
  setListeners(ledger) {
    this.plugins[ledger].on('outgoing_fulfill', transfer => {
      console.log('outgoing_fulfill!', ledger, transfer);
      this.pending[transfer.id].resolve(`It took ${new Date().getTime() - this.pending[transfer.id].outgoingPrepare}ms (${this.pending[transfer.id].expiresAt - new Date().getTime()}ms left) and has cost you ${transfer.amount} source ledger units.`);
    });
    this.plugins[ledger].on('outgoing_reject', transfer => {
      // console.log('outgoing_reject!', ledger, transfer);
      this.pending[transfer.id].reject(new Error('rejected by peer'));
    });
    this.plugins[ledger].on('outgoing_cancel', transfer => {
      // console.log('outgoing_cancel!', ledger, transfer);
      this.pending[transfer.id].reject(new Error('timed out by ledger'));
    });
    this.plugins[ledger].on('incoming_prepare', transfer => {
      // console.log('incoming_prepare!', ledger, transfer);
      // incoming_prepare! de.eur.blue. { id: '7de75a3e-2f02-49ed-8907-5a4f8a243ee1',
      //   direction: 'incoming',
      //   account: 'de.eur.blue.micmic',
      //   from: 'de.eur.blue.micmic',
      //   to: 'de.eur.blue.connectorland',
      //   ledger: 'de.eur.blue.',
      //   amount: '0.01',
      //   data: 
      //    { ilp_header: 
      //       { amount: '0.01',
      //         account: 'de.eur.blue.connectorland',
      //         data: [Object] } },
      //   executionCondition: 'cc:0:3:NM4LgYQos5lXIlT63OzD6zmBAlUroykzrQQCTVxtL14:32',
      //   expiresAt: '2017-03-10T13:19:50.085Z' }
      if (typeof this.fulfillments[transfer.id] !== 'undefined') {
        // console.log('have the fulfillment, fulfilling condition', ledger, transfer.id, this.fulfillments[transfer.id]);
        this.plugins[ledger].fulfillCondition(transfer.id, this.fulfillments[transfer.id]).then(() => {
          // console.log('fulfillCondition success');
        } , err => {
          // console.log('fulfillCondition fail', ledger, transfer, transfer.id, this.fulfillments[transfer.id], err);
        });
      } else {
        // console.log('cannot find the fulfillment, should check destination and try to forward');
        // try to forward
      }
    });
    this.plugins[ledger].on('incoming_message', message => {
      // console.log('incoming_message!', ledger, message);
      switch (message.data.method) {
      case 'quote_request':
        if ((message.from === message.to) && (typeof this.quoteRequests[message.data.id] === 'object')) {
          // this was a quote request to ourselves
          clearTimeout(this.quoteRequests[message.data.id].timeout);
          this.quoteRequests[message.data.id].resolve(message);
        } else {
          // console.log('unexpected message, method quote_request');
        }
        break;
      case 'quote_response':
        if (typeof this.quoteRequests[message.data.id] === 'object') {
          clearTimeout(this.quoteRequests[message.data.id].timeout);
          this.quoteRequests[message.data.id].resolve(message.data.data.source_amount);
        } else {
          // console.log('unexpected message, method quote_response');
        }
        break;
      case 'error':
        if (typeof this.quoteRequests[message.data.id] === 'object') {
          clearTimeout(this.quoteRequests[message.data.id].timeout);
          this.quoteRequests[message.data.id].reject(new Error(message.data.data.message));
        } else {
          // console.log('unexpected message, method error');
        }
        break;
      default:
        // console.log('unexpected message', ledger, message);
      }
    });
    this.plugins[ledger].on('outgoing_prepare', transfer => {
      this.pending[transfer.id].outgoingPrepare = new Date().getTime();
      this.pending[transfer.id].expiresAt = new Date(transfer.expiresAt).getTime();
      // console.log('outgoing_prepare', { ledger, transfer }, transfer.data, transfer.noteToSelf.key, timeLeft, routes[transfer.noteToSelf.key]);
    });
    [
      'incoming_transfer',
      'incoming_fulfill',
      'incoming_reject',
      'incoming_cancel',
      'outgoing_transfer',
      'info_change',
    ].map(eventName => {
      this.plugins[ledger].on(eventName, res => {
        // console.log('Noting event', ledger, eventName, res);
      });
    });
  },

// in = {
//   // goes into ILP packet:
//   "destinationAccount": "de.eur.bob",           // recipient
//   "destinationAmount": "0.01",                  // amount to receive
//   // goes into transfer itself:
//   "from": "us.usd.alice",                       // sender
//   "to": "us.usd.connie",                        // connector for first hop
//   "ledger": "us.usd.",                          // ledger those two are on
//   "amount": "0.013",                            // amount to send
// };
// out = {
//   "transfer": {
//     "id": "57aad850-4ff9-43e4-8966-9335ce98ea2a",
//     "account": "lu.eur.michiel-eur.micmic",
//     "ledger": "lu.eur.michiel-eur.",
//     "amount": "0.02",
//     "data": {
//       "ilp_header": {
//         "account": "us.usd.cornelius.connectorland.~psk.ke-ITDdsqck.rB9F8q4EBsJtOLC5uaYerQ.65f43234-5a2b-49c4-a6a3-371737efa023",
//         "amount": "0.01",
//         "data": {
//           "expires_at": "2017-03-09T18:05:57.600Z"
//         }
//       }
//     },
//     "executionCondition": "cc:0:3:2ga6A_EOk_j6MnMVfF_asCcRfcyyD7C_essN6rVR8V4:32",
//     "expiresAt": "2017-03-09T18:05:38.393Z"
//   },
//   "fulfillment": "cf:0:.........",
//   },
// };

  // getQuote({
  //   ledger: 'us.usd.red.',
  //   user: 'alice',
  //   // note that sourceAmount is missing!
  // }, {
  //   ledger: 'de.eur.blue.',
  //   user: 'bob',
  //   amount: '0.99'
  // },
  // 'connie',
  // 7000, 10000);
  // will return a promise for:
  // {
  //   success: true,
  //   delay: 1203,
  // }
  getQuote(from, to, connector) {
    var plugin = this.plugins[from.ledger];
    // this tries to be compatible with ilp-core 11.1.0
    var data = {
      method: 'quote_request',
      data: {
        source_address: from.ledger + from.account,
        destination_address: to.ledger + to.account,
        destination_amount: to.amount,
      },
      id: uuidV4(),
    };
    var promise = new Promise((resolve, reject) => {
      this.quoteRequests[data.id] = {
        data,
        resolve,
        reject,
      };
      // console.log('expecting message', data.id);
    });
    // circumvent plugin.sendMessage so we have more control over timing and error handling:
    return this.plugins[from.ledger].sendMessage({
      from: from.ledger + from.account,
      to: from.ledger + connector,
      account: from.ledger + connector,
      ledger: from.ledger,
      data,
    }).then(() => {
      this.quoteRequests[data.id].timeout = setTimeout(() => {
        // should not happen if timeout was not cleared, but checking anyway:
        if (typeof this.quoteRequests[data.id] === 'undefined') {
          return;
        }
        this.quoteRequests[data.id].reject(new Error('timeout'));
        delete this.quoteRequests[data.id];
      }, 20000);
      // and now, it's up to this.plugins[from.ledger].on('incoming_message', msg) handler
      // to actually resolve that promise when a quote_response comes in, before that timeout
      return promise;
    }).catch(err => {
      // console.log('sending quote request failed', from.ledger + connector, err);
      return Infinity;
    }).then(result => {
      // console.log('getQuote returns', result);
      return result;
    });
  },
  sendTransfer(from, to, connector, sourceTimeout) {
    // console.log('sendTransfer(', {from, to, connector, sourceTimeout });
    
    return this.addCondition({
      id: uuidV4(),
      from: from.ledger + from.account,
      to: from.ledger + connector,
      ledger: from.ledger,
      amount: from.amount,
      data: {
        ilp_header: {
          account: to.ledger + to.account,
          amount: '' + to.amount,
          data: {},
        },
      },
      expiresAt: JSON.parse(JSON.stringify(new Date(new Date().getTime() + sourceTimeout))),
    }).then(transfer => {
      // deal with bug in ilp-plugin-bells:
      transfer.account = transfer.to;

      transfer.noteToSelf = {};
      console.log('sending source payment!', from.ledger, transfer);
      var promise =  new Promise((resolve, reject) => {
        this.pending[transfer.id] = { resolve, reject }; //TODO: set our own timeout timer on this?
      });
      return this.plugins[from.ledger].sendTransfer(transfer).then(() => promise);
    });
  },
  addCondition(transfer) {
    // console.log('addCondition', transfer);
    return new Promise((resolve, reject) => {
      crypto.randomBytes(64, (err, secret) => { // much more than 32 bytes is not really useful here, I guess?
        if (err) {
          reject(err);
          return;
        }
        var paymentRequest = {
          address: transfer.data.ilp_header.account,
          amount: transfer.data.ilp_header.amount,
        };
        conditionPreimage = cryptoHelper.hmacJsonForPskCondition(paymentRequest, secret)
        transfer.executionCondition = cc.toConditionUri(conditionPreimage);
        this.fulfillments[transfer.id] = cc.toFulfillmentUri(conditionPreimage);
        resolve(transfer);
      });
    });
  },
  getAccounts() {
    var ret = [];
    for (var ledger in this.messaging) {
      if (this.messaging[ledger] < 10000) {
        ret.push({ ledger, account: this.credentials[this.ledger2host[ledger]].user });
      }
    }
    return ret;
  },
  stop() {
    for (var ledger in this.plugins) {
      delete this.plugins[ledger];
    }
  },
};

function firstHop(fromLedger, toLedger) {
  //   "transfer": {
  //     "id": "57aad850-4ff9-43e4-8966-9335ce98ea2a",
  //     "account": "lu.eur.michiel-eur.micmic",
  //     "ledger": "lu.eur.michiel-eur.",
  //     "amount": "0.02",
  //     "data": {
  //       "ilp_header": {
  //         "account": "us.usd.cornelius.connectorland.~psk.ke-ITDdsqck.rB9F8q4EBsJtOLC5uaYerQ.65f43234-5a2b-49c4-a6a3-371737efa023",
  //         "amount": "0.01",
  //         "data": {
  //           "expires_at": "2017-03-09T18:05:57.600Z"
  //         }
  //       }
  //     },
  //     "executionCondition": "cc:0:3:2ga6A_EOk_j6MnMVfF_asCcRfcyyD7C_essN6rVR8V4:32",
  //     "expiresAt": "2017-03-09T18:05:38.393Z"
  //   }

  var transfer = {
    id: routes[key].testPaymentId,
    to: routes[key].connector,
    from: fromLedger + 'connectorland',
    ledger: fromLedger,
    noteToSelf: { key },
    amount: '' + routes[key].price,
    data: routes[key].packet,
    executionCondition: `cc:0:3:${routes[key].condition}:32`,
    expiresAt: routes[key].expiresAt,
  };
  // console.log('trying to sendTransfer', JSON.stringify(transfer, null, 2));
  routes[key].startTime = new Date().getTime();
  return plugins[fromLedger].sendTransfer(transfer).then(() => {
    // console.log('source payment success', key, transfer, routes[key], balances[fromLedger]);
  }, err => {
    // console.log('payment failed', key, err, transfer, routes[key], balances[fromLedger]);
    if (err.name === 'NotAcceptedError') {
      routes[key].result = 'NotAcceptedError';
    } else {
      routes[key].result = 'could not send';
      process.exit(0);
    }
    numPending--;
    numFail++;
    // console.log({ numPending, numSuccess, numFail });
  });
}

function cancelRoutesFor(ledger) {
  for (var key in routes) {
    var parts = key.split(' ');
    if (parts[0] === ledger) {
      // console.log(`Cancelling test ${key}`);
      delete routes[key];
    }
  }
}

function checkFunds(ledger) {
  return plugins[ledger].getBalance().then(balance => {
    balances[ledger] = balance;
    // console.log(`Balance for ${ledger} is ${balance}`);
    if (balance <= 0.05) {
      cancelRoutesFor(ledger);
    }
  }, err => {
    // console.log('unable to check balance', ledger, err);
    cancelRoutesFor(ledger);
  });
}

function launchPayments() {
  // console.log(`Gathering routes...`);
  return gatherRoutes().then(() => {
    // console.log(`Connecting to ${Object.keys(plugins).length} plugins..`);
    return setupPlugins();
  }).then(() => {
    // console.log(`Checking funds...`);
    return Promise.all(Object.keys(plugins).map(checkFunds));
  }).then(() => {
  //  console.log(`Generating ${Object.keys(routes).length} conditions...`);
  //  return Promise.all(Object.keys(routes).map(genCondition));
  //}).then(() => {
    // console.log(`Sending ${Object.keys(routes).length} source payments...`);
    var delay = 0;
    return Promise.all(Object.keys(routes).map(key => {
      // if (key !== 'lu.eur.michiel. lu.eur.michiel-eur.') {
      //   return Promise.resolve();
      // }
      return new Promise((resolve, reject) => {
        setTimeout(() => {
         routes[key].result = 'generating condition';
          genCondition(key).then(() => {
            routes[key].result = 'sending first hop';
            resolve(firstHop(key));
          }, reject);
          numPending++;
        }, delay);
       delay += 1000;
       routes[key].result = 'queued to start';
     }).catch(err => {
       // console.log('Source payment failed', key, err);
       numPending--;
       numFail++;
       routes[key].result = err.message;
     }).then(() => {
       routes[key].result = 'first hop sent';
     });
   }));
  }).then(() => {
    // console.log(`Waiting for incoming_prepare and outgoing_fulfill messages...`);
    // console.log(`For ${numPending} source payments...`);
  });
};

module.exports = Client;
////...
//setInterval(saveResults, 5000);
//launchPayments();

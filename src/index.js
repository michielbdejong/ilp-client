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
var request = require('request-promise-native');
var inspect = require('./lib/inspect');
var rates = require('./lib/rates');

// credentials should be an key-value hash (i.e., an Object), where:
// * keys are <String> DNS hostnames, e.g. 'ilp-kit.michielbdejong.com'
// * values are objects with:
//   - user: <String> FiveBellsLedger username, e.g. 'admin'
//   - password: <String> password for that FiveBellsLedger user, e.g, 'hunter2' ;)
function Client(credentials) {
  if (typeof credentials !== 'object') {
    throw new Error(`Please construct as new Client({ 'example.com': { user: 'foo', password: 'bar' } });`);
  }
  this.credentials = credentials;
  ['stats', 'plugins', 'fulfillments', 'quoteRequests', 'transfers'].map(field => {
    this[field] = {};
  });
  this.stats.ledgers = {};
  this.stats.connectors = {};
}

function withTimeout(promise, time) {
  return new Promise((resolve, reject) => {
    var timeout = setTimeout(() => {
      reject(new Error(`Timeout of ${time}ms expired`));
    }, time);
    promise.then(val => {
      clearTimeout(timeout);
      resolve(val);
    }, err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function rollingAverage(existingAvg, newVal) {
  const FACTOR = 10;
  if (typeof existingAvg !== 'number') {
    return newVal;
  }
  return (
    (FACTOR-1) * existingAvg + newVal
  )/FACTOR;
}

Client.prototype = {
  init(addOtherLedgers) {
    var promise = Promise.resolve();
    var knownHosts = {};
    return Promise.resolve().then(() => {
      if (addOtherLedgers) {
        const linePrefixWeWant = '  { "hostname": "'; // FIXME: better than eval(), but not robust
        return request({
          url: 'https://connector.land/data/hosts.js',
          timeout: 5000,
        }).then(body => {
          body.split('\n').filter(line => {
            return (line.substring(0, linePrefixWeWant.length) === linePrefixWeWant);
           }).map(lineWeWant => lineWeWant.substring(linePrefixWeWant.length).split('"')[0]).map(hostname => {
            knownHosts[hostname] = false;
          });
        }).catch(err => {
          // use just the hosts where we have credentials
          console.log(err);
        })
      }
    }).then(() => {
      for (var hostname in this.credentials) {
        knownHosts[hostname] = true;
      }
      console.log(knownHosts);
      return Promise.all(Object.keys(knownHosts).map(hostname => {
        return inspect.getHostInfo(hostname).then(obj => {
          for (var field in obj) {
            this.stats.hosts[hostname][field] = obj[field];
          }
          return this.initLedger(hostname);
        }).then(ledger => {
          console.log(hostname);
          return this.msgToSelf(ledger);
        }).catch(err => {
          console.log('Error initializing ledger for', hostname, err);
        });
      }));
    }).then(() => {
      //  this.checkTimer = setInterval(() => {
      //    var promises = [];
      //    Object.keys(this.plugins).map(ledger => {
      //      console.log(`Testing messaging on ${ledger}`);
      //      promises.push(this.msgToSelf(ledger));
      //      promises.push(this.plugins[ledger].getBalance().then(balance => {
      //        this.balances[ledger] = balance;
      //      }, () => { console.log(`Could not get balance for ${ledger}`); }));
      //    });
      //    Promise.all(promises).then(() => {
      //      console.log(this.stats, this.balances);
      //    });
      //  }, 10000);
    });
  },
  stop() {
    clearInterval(this.checkTimer);
    for (var ledger in this.plugins) {
      this.removePlugin(ledger);
    }
  },
  reconnectLedger(ledger) {
    return this.removePlugin(ledger).then(() => {
      return this.initPlugin(ledger);
    });
  },
  msgToSelf(ledger) {
    // console.log('got username', ledger, this.ledger2host(ledger), this.credentials[this.ledger2host(ledger)]);
    var credentials = this.credentials[this.ledger2host(ledger)];
    if (!credentials) {
      return Promise.resolve();
    }
    var startTime = new Date().getTime();
    return this.getQuote({
      ledger,
      account: credentials.user,
    }, {}, credentials.user, 7000, 10000).then(() => {
      this.stats.ledgers[ledger].msgDelay = rollingAverage(this.stats.ledgers[ledger].msgDelay, new Date().getTime() - startTime);
      this.stats.ledgers[ledger].msgSuccess = rollingAverage(this.stats.ledgers[ledger].msgSuccess, 1);
    }, () => {
      this.stats.ledgers[ledger].msgSuccess = rollingAverage(this.stats.ledgers[ledger].msgSuccess, 0);
      console.error(`Reconnecting to ${ledger}`);
      return this.reconnectLedger(ledger);
    });
  },
  initLedger(host) {
    var ledgerUri = this.stats.hosts[host].ledgerUri;
    if (typeof ledgerUri !== 'string') {
      // console.log('skipping initLedger', host, this.stats.hosts[host]);
      return Promise.resolve();
    }
    var ledger;
    return inspect.getLedgerInfo(ledgerUri).then(ledgerInfo => {
      ledger = ledgerInfo.ilp_prefix;
      for (var field in ledgerInfo) {
        this.stats.ledgers[ledger][field] = ledgerInfo[field];
      }
      this.stats.ledgers[ledger].hostname = host;
      if (typeof this.credentials[host] === 'undefined') {
        return Promise.resolve();
      }
      console.log('calling initPlugin', ledger);
      return this.initPlugin(ledger).then(() => {
        return this.plugins[ledger].getBalance();
      }).then(balance => {
        // TODO: support multiple accounts per ledger here
        this.stats.ledgers[ledger].balances = {};
        this.stats.ledgers[ledger].balances[this.credentials[host].user] = balance;
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
  getReachableLedgers() {
    //TODO: check if a route really exists from one of our accounts
    // to this host
    return Object.keys(this.stats.ledgers);
  },
  initConnectors(ledger) {
    // console.log('getting connectors', ledger, this.stats.ledgers[ledger]);
    var defaultConnectors = this.stats.ledgers[ledger].connectors.map(obj => obj.name);
    var extraConnectors = ['micmic'];
    defaultConnectors.concat(extraConnectors).map(conn => {
      // ...
    });
  },
  getConnectors(ledger) {
    // console.log('getting connectors', ledger, this.stats.ledgers[ledger]);
    var ret; 
    var arr = this.stats.ledgers[ledger].connectors;
    if (Array.isArray(arr)) {
      ret = arr.map(obj => obj.name);
    } else {
      ret = [];
    }
    if (ret.indexOf('micmic') === -1) {
      ret.push('micmic');
    }
    return ret;
  },
  getStats() {
    return this.stats;
  },
  setStats(stats) {
    this.stats = stats;
  },
  getRate(ledger) {
    return rates.getRate(this.stats.ledgers[ledger].currency_code).then(rate => {
      this.stats.ledgers[ledger].rate = rate;
    });
  },
  initPlugin(ledger) {
    var credentials = this.credentials[this.ledger2host(ledger)];
    if (typeof credentials === 'undefined') {
      return Promise.reject();
    }
    console.log('getting plugin for', ledger, credentials);
    this.plugins[ledger] = new Plugin({
      ledger,
      account: `https://${this.ledger2host(ledger)}/ledger/accounts/${credentials.user}`,
      password: credentials.password,
    });
    if (typeof this.stats.ledgers[ledger] === 'undefined') {
      this.stats.ledgers[ledger] = {};
    }
    var startTime = new Date().getTime();
    return this.plugins[ledger].connect({ timeout: 10000 }).then(() => {
      this.stats.ledgers[ledger].connectDelay = rollingAverage(this.stats.ledgers[ledger].connectDelay, new Date().getTime() - startTime);
      this.stats.ledgers[ledger].connectSuccess = rollingAverage(this.stats.ledgers[ledger].connectSuccess, 1);
      return this.setListeners(ledger);
    }, err => {
      this.stats.ledgers[ledger].connectSuccess = rollingAverage(this.stats.ledgers[ledger].connectSuccess, 0);
      // console.log('could not connect to', this.ledger2host(ledger), ledger, err);
    });
  },
  removePlugin(ledger) {
    return withTimeout(this.plugins[ledger].disconnect());
  },
  setListeners(ledger) {
    this.plugins[ledger].on('outgoing_fulfill', transfer => {
      console.log('outgoing_fulfill!', ledger, transfer);
      try {
        var timeTaken =new Date().getTime() - this.transfers[transfer.id].outgoingPrepare;
        var timeMax = this.transfers[transfer.id].expiresAt - new Date().getTime();
        var timePerc = Math.floor((timeTaken / timeMax) * 100 + .5);
        console.log({ timeTaken, timeMax, timePerc });

        var srcAmount = transfer.amount;
        var srcCurr = this.stats.ledgers[ledger].currency_code;
        var dest = this.transfers[transfer.id].dest;
        var destAmount = dest.amount;
        var destCurr = this.stats.ledgers[dest.ledger].currency_code;
        console.log({ srcAmount, srcCurr, dest, destAmount, destCurr });

        var exchangeFactor = this.stats.ledgers[ledger].rate / this.stats.ledgers[dest.ledger].rate;
        var feeBase = exchangeFactor * destAmount;
        var feeFactor = srcAmount / feeBase;
        var feePerc = Math.floor((feeFactor * 100) + .5) - 100;
        console.log({ srcRate: this.stats.ledgers[ledger].rate, destRate: this.stats.ledgers[dest.ledger].rate, exchangeFactor, feeBase, feeFactor, feePerc });
      } catch(e) {
        console.log(e);
        //str = 'It worked!';
      }
      this.transfers[transfer.id].resolve({
        timeTaken,
        timePerc,
        timeMax,
        srcAmount,
        srcCurr,
        destAmount,
        destCurr,
        feePerc,
      });
    });
    this.plugins[ledger].on('outgoing_reject', transfer => {
      // console.log('outgoing_reject!', ledger, transfer);
      this.transfers[transfer.id].reject(new Error('rejected by peer'));
    });
    this.plugins[ledger].on('outgoing_cancel', transfer => {
      // console.log('outgoing_cancel!', ledger, transfer);
      this.transfers[transfer.id].reject(new Error('timed out by ledger'));
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
      this.transfers[transfer.id].outgoingPrepare = new Date().getTime();
      this.transfers[transfer.id].expiresAt = new Date(transfer.expiresAt).getTime();
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
    if (typeof plugin === 'undefined') {
      return Promise.reject('Cannot connect to source ledger');
    }
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
      }, 5000);
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
    }, to).then(transfer => {
      // deal with bug in ilp-plugin-bells:
      transfer.account = transfer.to;

      transfer.noteToSelf = {};
      console.log('sending source payment!', from.ledger, transfer);
      var promise =  new Promise((resolve, reject) => {
        this.transfers[transfer.id] = { resolve, reject }; //TODO: set our own timeout timer on this?
        this.transfers[transfer.id].dest = to; // keep track of this for reporting what it was when outgoing_fulfill is triggered
      });
      // now that the completion listener is set, we can launch the transfer:
      return this.plugins[from.ledger].sendTransfer(transfer).then(() => {
        return promise.then(transferStats => {
          var stats = this.getTransferStats(from.ledger, to.ledger, connector);
          stats.transferSuccess = rollingAverage(stats.transferSuccess, 1);
          stats.transferDelay = rollingAverage(stats.transferDelay, transferStats.timeTaken);
          stats.transferFeePerc = rollingAverage(stats.transferFeePerc, transferStats.feePerc);
          this.setTransferStats(from.ledger, to.ledger, connector, stats);
          return `It took ${transferStats.timeTaken}ms (${transferStats.timePerc}% of  ${transferStats.timeMax}ms max) ` +
          `and has cost you ${transferStats.srcAmount} ${transferStats.srcCurr}` +
          ` to send ${transferStats.destAmount} ${transferStats.destCurr} (a ${transferStats.feePerc}% fee)`;
        }, err => {
          var stats = this.getTransferStats(from.ledger, to.ledger, connector);
          stats.transferSuccess = rollingAverage(stats.transferSuccess, 0);
          this.setTransferStats(from.ledger, to.ledger, connector, stats);
          throw err;
        });
      });
    });
  },
  getTransferStats(fromLedger, toLedger, connector) {
    try {
      return this.stats.routes[fromLedger][toLedger][connector];
    } catch(e) {
      return {};
    }
  },
  setTransferStats(fromLedger, toLedger, connector, stats) {
    if (typeof this.stats.routes === 'undefined') {
      this.stats.routes = {};
    }
    if (typeof this.stats.routes[fromLedger] === 'undefined') {
      this.stats.routes[fromLedger] = {};
    }
    if (typeof this.stats.routes[fromLedger][toLedger] === 'undefined') {
      this.stats.routes[fromLedger][toLedger] = {};
    }
    if (typeof this.stats.routes[fromLedger][toLedger][connector] === 'undefined') {
      this.stats.routes[fromLedger][toLedger][connector] = {};
    }
    this.stats.routes[fromLedger][toLedger][connector] = stats;
  },
  ledger2host(ledger) {
    return this.stats.ledgers[ledger].hostname;
  },
  getIPR(to) {
    var host = this.ledger2host(to.ledger);
    return request({
      url: `https://${host}/.well-known/webfinger?resource=acct:${to.account}@${host}`,
      timeout: 5000,
      json: true,
    }).then(webfinger => {
      var url;
      for (var i=0; i<webfinger.links.length; i++) {
        if (webfinger.links[i].rel === 'https://interledger.org/rel/receiver') {
          return request({
            method: 'POST',
            timeout: 5000,
            url: webfinger.links[i].href,
            json: true,
            body: {
              amount: to.amount,
            },
          });
        }
      }
      // should not reach here
      console.log(webfinger);
      throw new Error('Could not find receivers endpoint for ' + JSON.stringify(to));
    });
  },
    
  addCondition(transfer, to) {
    var paymentToSelf = ((typeof this.stats.ledgers[to.ledger].messaging !== 'undefined') && (this.credentials[this.ledger2host(to.ledger)].user === to.account));

    if (paymentToSelf) {
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
    } else {
      return this.getIPR(to).then(paymentRequest=> {
        // paymentRequest = {
        //   address: 'us.usd.cornelius.admin.~ipr.KuIVLqthTOY.07be617c-c252-44cc-8b30-526b012b7188',
        //   amount: '11.8',
        //   expires_at: '2017-03-16T14:00:24.971Z',
        //   condition: 'cc:0:3:Ti1mIQg8c_N5wgVM9E74mhhEntuySrQzuca6TOsGg88:32'
        // }

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
        transfer.data.ilp_header.account = paymentRequest.address;
        if (parseFloat(transfer.data.ilp_header.amount) !== parseFloat(paymentRequest.amount)) {
          throw new Error(`wrong amount in IPR! ${transfer.data.ilp_header.amount} !== ${paymentRequest.amount}`);
        }
        transfer.data.ilp_header.data = {
          expires_at: paymentRequest.expires_at,
        };
        transfer.executionCondition = paymentRequest.condition;
        return transfer;
      });
    }
  },
  getReachableAccounts(fromAccount) {
    //TODO: something similar to getReachableLedgers
    return this.getAccounts().filter(recipient => {
      return recipient.ledger !== fromAccount.ledger;
      // TODO: implement same-ledger payments transparently
      // for now, we pretend same-ledger routes don't exist :)
    });
  },
  getAccounts() {
    var ret = [];
    for (var ledger in this.stats.ledgers) {
      if ((typeof this.stats.ledgers[ledger].messaging === 'number') && (this.stats.ledgers[ledger].messaging < 10000)) {
        if (typeof this.credentials[this.ledger2host(ledger)] === 'undefined') {
          console.log('have stats but not credentials', ledger, this.ledger2host(ledger));
        } else {
          ret.push({ ledger, account: this.credentials[this.ledger2host(ledger)].user });
        }
      }
    }
    return ret;
  },
  stop() {
    for (var ledger in this.plugins) {
      delete this.plugins[ledger];
    }
  },

  getQuotes(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount) {
    // console.log('function getQuotes(', sourceLedger, destinationLedger);
    return Promise.all(this.getConnectors(sourceLedger).map(conn => {
      return this.getQuote({
        ledger: sourceLedger,
        account: sourceAccount, // note that currently the client can only remember credentials for one sourceAccount per ledger
      }, {
        ledger: destinationLedger,
        account: destinationAccount,
        amount: amount,
      }, conn).catch(err => {
        // console.log('client.getQuote rejected its promise', err);
        return Infinity;
      }).then(sourceAmount => {
        return { conn, sourceAmount };
      });
    })).then(results => {
      // console.log('results returned by getQuotes', results);
      return results;
    });
  },
  sendMoney(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount) {
    return this.getQuotes(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount).then(results => {
      // console.log('result of getQuotes', results);
      var bestConn, bestAmount=Infinity;
      results.map(obj => {
        // console.log('considering quote', obj, bestConn, bestAmount);
        if (obj.sourceAmount < bestAmount) {
          bestConn = obj.conn;
          bestAmount = obj.sourceAmount;
        }
      });
      // console.log('best is', bestConn, bestAmount);
      if (bestAmount === Infinity) {
        throw new Error('Could not get a quote');
      }
      return this.sendTransfer({
        ledger: sourceLedger,
        account: sourceAccount, // note that currently the client can only remember credentials for one sourceAccount per ledger
        amount: '' + bestAmount,
      }, {
        ledger: destinationLedger,
        account: destinationAccount,
        amount: amount,
      }, bestConn, 30000);
    });
  },
  stealMoney(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount) {
    return Promise.resolve('coming soon! ;)');
  },
};

module.exports = Client;

var Plugin = require('ilp-plugin-bells');  // TODO: allow other ledger types
var Packet       = require('ilp-79/src/utils/packet');
var cryptoHelper = require('ilp-79/src/utils/crypto');
var base64url    = require('ilp-79/src/utils/base64url');
var cc           = require('ilp-79/src/utils/condition');
var uuidV4 = require('uuid/v4');
var crypto = require('crypto');

var inspect = require('./lib/inspect');

function Client(credentials) {
  if (typeof credentials !== 'object') {
    throw new Error(`Please construct as new Client({ example.com: { user: 'foo', password: 'bar' } });`);
  }
  this.credentials = credentials;
  this.hosts = {};
  this.plugins = {};
  this.fulfillments = {};
  this.balances = {};
  this.rates = {};
}

Client.prototype = {
  init() {
    var promise = [];
    return Promise.all(Object.keys(this.credentials).map(host => {
      return inspect.getWebFinger(host).then(obj => {
        this.hosts[host] = obj;
        return this.initLedger(host);
      }).catch(err => {
        console.log(host, err);
      });
    }));
  },
  initLedger(host) {
    if (typeof this.hosts[host].ledgerUri === 'string') {
      return Promise.resolve();
    }
    return inspect.getLedgerInfo(obj.ledgerUri).then(ledgerInfo => {
console.log({ ledgerInfo, host });
      var ledger = ledgerInfo.ilp_prefix;
      var credentials = this.credentials[host];
      this.plugins[ledger] = new Plugin({
        ledger,
        account: `https://${host}/ledger/accounts/${credentials.user}`,
        password: credentials.password,
      });
      return this.plugins[ledger].connect({ timeout: 10000 }).then(() => {
        return ledger;
      });
    }).then(ledger => {
      return this.setListeners(ledger);
    }, err => {
      console.log('could not connect to', host, ledger, err);
    });
  },
  setListeners(ledger) {
    this.plugins[ledger].on('outgoing_fulfill', transfer => {
      this.pending[transfer.id].resolve();
    });
    this.plugins[ledger].on('outgoing_reject', transfer => {
      this.pending[transfer.id].reject(new Error('rejected by peer'));
    });
    this.plugins[ledger].on('outgoing_cancel', transfer => {
      this.pending[transfer.id].reject(new Error('timed out by ledger'));
    });
    this.plugins[ledger].on('incoming_prepare', transfer => {
      console.log('incoming_prepare!', ledger, transfer);
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
        plugins[ledger].fulfillCondition(transfer.id, 'cf:0:' + this.fulfillments[transfer.id]).then(() => {
          console.log('fulfillCondition success');
        } , err => {
          console.log('fulfillCondition fail', ledger, transfer, transfer.id, this.fulfillments[transfer.id], err);
        });
      } else {
        // try to forward
      }
    });
    this.plugins[ledger].on('outgoing_prepare', transfer => {
      this.pending[transfer.id].outgoingPrepare = new Date().getTime();
      this.pending[transfer.id].expiresAt = new Date(transfer.expiresAt).getTime();
      console.log('outgoing_prepare', { ledger, transfer }, transfer.data, transfer.noteToSelf.key, timeLeft, routes[transfer.noteToSelf.key]);
    });
    [
      'incoming_transfer',
      'incoming_fulfill',
      'incoming_reject',
      'incoming_cancel',
      'incoming_message',
      'outgoing_transfer',
      'outgoing_reject',
      'info_change',
    ].map(eventName => {
      this.plugins[ledger].on(eventName, res => {
        console.log('Noting event', ledger, eventName, res);
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

  // sendTransfer({
  //   ledger: 'us.usd.red.',
  //   user: 'alice',
  //   amount: '1.00'
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
  sendTransfer(from, to, connector, timeout1, timeout2) {
    var transfer = this.addCondition({
      id: uuidV4(),
      from: from.ledger + from.user,
      to: from.ledger + connector,
      ledger: from.edger,
      amount: from.amount,
      data: {
        ilp_header: {
          account: to.ledger + to.user,
          amount: to.amount,
          data: {
            expires_at: JSON.parse(JSON.stringify(new Date( new Date().getTime() + timeout))),
          },
        },
      },
      expiresAt: JSON.parse(JSON.stringify(new Date( new Date().getTime() + timeout))),
    });
    this.plugins[from.ledger].sendTransfer(transfer);
  },
  addCondition(transfer) {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(64, (err, secret) => { // much more than 32 bytes is not really useful here, I guess?
        if (err) {
          reject(err);
          return;
        }
        var packet = Packet.serialize({
          destinationAccount: transfer.data.ilp_header.account,
          destinationAmount: transfer.data.ilp_header.amount,
          data: {
            blob: base64url(cryptoHelper.aesEncryptObject({
              expiresAt: transfer.data.ilp_header.amount,
              data: undefined
            }, secret)),
          }
        });
        console.log(transfer.data.ilp_header, packet); process.exit(0);
        transfer.executionCondition = 'cc:0:3:' + base64url(cc.toCondition(cryptoHelper.hmacJsonForPskCondition(packet, secret))) + ':32';
        this.fulfillments[transfer.id] = 'cf:0:' + cc.toFulfillment(cryptoHelper.hmacJsonForPskCondition(packet, secret));
        resolve(transfer);
      });
    });
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
  console.log('trying to sendTransfer', JSON.stringify(transfer, null, 2));
  routes[key].startTime = new Date().getTime();
  return plugins[fromLedger].sendTransfer(transfer).then(() => {
    console.log('source payment success', key, transfer, routes[key], balances[fromLedger]);
  }, err => {
    console.log('payment failed', key, err, transfer, routes[key], balances[fromLedger]);
    if (err.name === 'NotAcceptedError') {
      routes[key].result = 'NotAcceptedError';
    } else {
      routes[key].result = 'could not send';
      process.exit(0);
    }
    numPending--;
    numFail++;
    console.log({ numPending, numSuccess, numFail });
  });
}

function cancelRoutesFor(ledger) {
  for (var key in routes) {
    var parts = key.split(' ');
    if (parts[0] === ledger) {
      console.log(`Cancelling test ${key}`);
      delete routes[key];
    }
  }
}

function checkFunds(ledger) {
  return plugins[ledger].getBalance().then(balance => {
    balances[ledger] = balance;
    console.log(`Balance for ${ledger} is ${balance}`);
    if (balance <= 0.05) {
      cancelRoutesFor(ledger);
    }
  }, err => {
    console.log('unable to check balance', ledger, err);
    cancelRoutesFor(ledger);
  });
}

function launchPayments() {
  console.log(`Gathering routes...`);
  return gatherRoutes().then(() => {
    console.log(`Connecting to ${Object.keys(plugins).length} plugins..`);
    return setupPlugins();
  }).then(() => {
    console.log(`Checking funds...`);
    return Promise.all(Object.keys(plugins).map(checkFunds));
  }).then(() => {
  //  console.log(`Generating ${Object.keys(routes).length} conditions...`);
  //  return Promise.all(Object.keys(routes).map(genCondition));
  //}).then(() => {
    console.log(`Sending ${Object.keys(routes).length} source payments...`);
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
       console.log('Source payment failed', key, err);
       numPending--;
       numFail++;
       routes[key].result = err.message;
     }).then(() => {
       routes[key].result = 'first hop sent';
     });
   }));
  }).then(() => {
    console.log(`Waiting for incoming_prepare and outgoing_fulfill messages...`);
    console.log(`For ${numPending} source payments...`);
  });
};

module.exports = Client;
////...
//setInterval(saveResults, 5000);
//launchPayments();

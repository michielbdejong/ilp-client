var Client = require('ilp-client');
var passwords = require('./passwords');
var credentials = {};

const user = 'connectorland';

Object.keys(passwords).map(host => {
  credentials[host] = {
   user,
   password: passwords[host],
 };
});
var client = new Client(credentials);
client.init().then(() => {
  console.log('hosts:', Object.keys(client.hosts));
  console.log('plugins:', Object.keys(client.plugins));
  return client.getQuote({
    ledger: 'lu.eur.michiel.',
    account: user,
  }, {
    ledger: 'lu.eur.michiel-eur.',
    account: user,
    amount: '1.0',
  }, 'micmic', 7000, 10000).then(sourceAmount => {
    return client.getQuote({
      ledger: 'lu.eur.michiel.',
      account: user,
      amount: sourceAmount,
    }, {
      ledger: 'lu.eur.michiel-eur.',
      account: user,
      amount: '1.0',
    });
  });
}).catch(err => {
  console.error('it went wrong', err);
}).then(() => {
  client.stop();
});


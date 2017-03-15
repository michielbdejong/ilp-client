var Client = require('.');
var inquirer = require('inquirer');
var passwords = require('./passwords');
var credentials = {};

const user = 'connectorland';

passwords.map(arr => {
  credentials[arr[0]] = {
   user: arr[1],
   password: arr[2],
 };
});


function getQuotes(sourceLedger, destinationLedger) {
  // console.log('function getQuotes(', sourceLedger, destinationLedger);
  return Promise.all(client.getConnectors(sourceLedger).map(conn => {
    return client.getQuote({
      ledger: sourceLedger,
      account: client.credentials[client.ledger2host[sourceLedger]].user,
    }, {
      ledger: destinationLedger,
      account: client.credentials[client.ledger2host[destinationLedger]].user,
      amount: '0.01',
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
}
function sendMoney(sourceLedger, destinationLedger) {
  return getQuotes(sourceLedger, destinationLedger).then(results => {
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
    return client.sendTransfer({
      ledger: sourceLedger,
      account: client.credentials[client.ledger2host[sourceLedger]].user,
      amount: '' + bestAmount,
    }, {
      ledger: destinationLedger,
      account: client.credentials[client.ledger2host[destinationLedger]].user,
      amount: '0.01',
    }, bestConn, 10000);
  });
}
function stealMoney(sourceLedger, destinationLedger) {
  return Promise.resolve('coming soon!');
}
  

function mainMenu() {
  return inquirer.prompt([{
    message: 'What do you want to do?',
    type: 'list',
    name: 'task',
    choices: [
      { name: 'Get quotes', value: getQuotes },
      { name: 'Send money', value: sendMoney },
      { name: 'Steal money', value: stealMoney },
      { name: 'Exit', value: 'exit' },
    ]
  }]).then(answers => {
    if (answers.task !== 'exit') {
      return doTask(answers.task).then(() => {
        return mainMenu();
      });
    }
    console.log('Thank you for using ilp-client!');
    process.exit(0);
  });
}
function doTask(task) {
  return inquirer.prompt([{
    message: 'From which source ledger?',
    type: 'list',
    name: 'sourceLedger',
    choices: client.getAccounts().map(obj => obj.ledger),
  }, {
    message: 'To which destination ledger?',
    type: 'list',
    name: 'destinationLedger',
    choices: client.getAccounts().map(obj => obj.ledger),
  }]).then(answers => {
    return task(answers.sourceLedger, answers.destinationLedger);
  }).then(result => {
    console.log('result of your action:', result);
  }).catch(err => {
    console.error('it went wrong', err);
  }).then(() => {
    console.log('Now, without further ado, let\'s go back to the main menu!');
  });
}

// ...
console.log(`Connecting to ${Object.keys(credentials).length} ledgers...`);
var client = new Client(credentials);
client.init().then(() => {
  return mainMenu();
});

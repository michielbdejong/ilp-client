var Client = require('.');
var inquirer = require('inquirer');
var passwords = require('./passwords');
var credentials = {};

const user = 'connectorland';

passwords.map(arr => {
  if (arr.length !== 3) {
    throw new Error(`Entry with ${arr.length} fields found in passwords.js file, please follow the format of passwords.js-sample`);
  }
  arr.map(field => {
    if (typeof field !== 'string') {
      throw new Error(`Non-string field found in passwords.js file, please follow the format of passwords.js-sample`);
    }
    if (field.length === 0) {
      throw new Error(`Empty string field found in passwords.js file, please follow the format of passwords.js-sample`);
    }
  });
  console.log(`Have a password for user ${arr[1]} on host ${arr[0]}`);
  credentials[arr[0]] = {
   user: arr[1],
   password: arr[2],
 };
});


function getQuotes(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount) {
  // console.log('function getQuotes(', sourceLedger, destinationLedger);
  return Promise.all(client.getConnectors(sourceLedger).map(conn => {
    return client.getQuote({
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
}
function sendMoney(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount) {
  return getQuotes(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount).then(results => {
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
      account: sourceAccount, // note that currently the client can only remember credentials for one sourceAccount per ledger
      amount: '' + bestAmount,
    }, {
      ledger: destinationLedger,
      account: destinationAccount,
      amount: amount,
    }, bestConn, 30000);
  });
}
function stealMoney(sourceLedger, sourceAccount, destinationLedger, destinationAccount, amount) {
  return Promise.resolve('coming soon! ;)');
}
  
String.prototype.padEnd = function(targetLength) {
  var ret = this;
  while (ret.length < targetLength) {
    ret  += ' ';
  }
  return ret;
};

function mainMenu() {
  console.log(['Host', 'Ledger', 'Account', 'Balance'].map(col => col.padEnd(50)).join('\t'));
  console.log(Object.keys(client.balances).map(ledger => `${client.ledger2host[ledger].padEnd(50)}\t${ledger.padEnd(50)}\t${client.credentials[client.ledger2host[ledger]].user.padEnd(50)}\t${client.balances[ledger]}`).join('\n'));
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
    choices: client.getReachableLedgers(),
  }]).then(answers1 => {
    console.log({ answers1 });
    var sourceHost = client.ledger2host[answers1.sourceLedger];
    var sourceUser = client.credentials[sourceHost].user;
    return inquirer.prompt([{
      message: `From which source account on ${answers1.sourceLedger}?`,
      type: 'list',
      name: 'sourceAccount',
      choices: [ { value: sourceUser, name: `${sourceUser} (balance: ${client.balances[answers1.sourceLedger]} ${client.ledgerInfo[answers1.sourceLedger].currency_code})` } ],
    }, {
      message: `To which destination account on ${answers1.destinationLedger}?`,
      type: 'input',
      name: 'destinationAccount',
    }, {
      message: `How much would you like to send? (in ${client.ledgerInfo[answers1.destinationLedger].currency_code})`,
      type: 'input',
      name: 'amount',
      validate: (val) => { return (isNaN(parseInt(val)) ? 'Please specify a number' : true) },
    }]).then(answers2 => {
      console.log({ answers2 });
      return task(answers1.sourceLedger, answers2.destinationAccount, answers1.destinationLedger, answers2.destinationAccount, answers2.amount);
    });
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

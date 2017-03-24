var Client = require('.');
var inquirer = require('inquirer');
var passwords = require('./passwords');
var addressBook = require('./addressbook.json');

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
  console.log(`Have a password for user ${arr[1]} on ledger ${arr[0]}`);
});
 
String.prototype.padEnd = function(targetLength) {
  var ret = this;
  while (ret.length < targetLength) {
    ret  += ' ';
  }
  return ret;
};

function mainMenu() {
  console.log(['Ledger', 'Account', 'Balance', '(Host)'].map(col => col.padEnd(50)).join('\t'));
  console.log(passwords.map(obj => {
    try {
      var ledger = obj[0];
      var user = obj[1];
      var balance = client.stats.ledgers[ledger].balances[user];
      var host = client.stats.ledgers[ledger].hostname || '(Unhosted)';
      return `${host.padEnd(50)}\t${ledger.padEnd(50)}\t${user.padEnd(50)}\t${balance}\t${host}\n`;
    } catch (e) {
      return '';
    }
  }).join(''));
  return inquirer.prompt([{
    message: 'What do you want to do?',
    type: 'list',
    name: 'task',
    choices: [
      { name: 'Add an address to the addressbook', value: addressBookAdds },
      { name: 'Send money to someone', value: sendMoney },
      { name: 'Balance my own money', value: balanceMoney },
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
    message: 'To which destination ledger?',
    type: 'list',
    name: 'destinationLedger',
    choices: client.getReachableLedgers(),
  }]).then(answers1 => {
    console.log({ answers1 });
    return inquirer.prompt([{
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
console.log('this is where we would get quotes from all known connectors, on ledgers where we have at least one account, and present all the options')
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
// client.init(true /* add destination ledgers which https://connector.land should be reachable destinations */).then(() => {
client.init().then(() => { // add just destination ledgers where we have an account
  console.log('client init done');
  return mainMenu();
});

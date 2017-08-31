const Web3 = require('web3')
web3 = new Web3(new Web3.providers.HttpProvider('http://geth:8545'))

var browser_test_events_sol_crowdfundingContract = web3.eth.contract([
  {"constant":true,"inputs":[],"name":"deadline","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},
  {"constant":false,"inputs":[],"name":"withdrawal","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},
  {"anonymous":false,"inputs":[
    {"indexed":false,"name":"deadline","type":"uint256"},
    {"indexed":false,"name":"timeNow","type":"uint256"}
  ],"name":"DeadlineSet","type":"event"}
]);
var browser_test_events_sol_crowdfunding = browser_test_events_sol_crowdfundingContract.new({
  from: web3.eth.accounts[0], 
  data: '0x6060604052341561000f57600080fd5b5b6101148061001f6000396000f30060606040526000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff16806329dcb0cf146047578063d4e9329214606d575b600080fd5b3415605157600080fd5b60576097565b6040518082815260200191505060405180910390f35b3415607757600080fd5b607d609d565b604051808215151515815260200191505060405180910390f35b60005481565b60007f58703a16a42a40344415e2e3f944d45c5c88782a96d058322eb88ce3c7c68fce60005442604051808381526020018281526020019250505060405180910390a1600190505b905600a165627a7a72305820f7ecc6ae6148d68a1afc2ccd8521192aaf7a870f83b9ab2c00f104ef06b0d7e20029', 
  gas: '4700000'
}, function (e, contract) {
  console.log(e, contract);
  if (typeof contract.address !== 'undefined') {
    console.log('Contract mined! address: ' + contract.address + ' transactionHash: ' + contract.transactionHash);
    var deadlineSet= browser_test_events_sol_crowdfunding.DeadlineSet({fromBlock: 0, toBlock: 'latest'});
    deadlineSet.watch(function(err, result) {
      if (err) {
        console.log(err);
        return;
      }
      console.log("Deadline " + result.args.deadline);
      console.log("Time Now " + result.args.timeNow);
      deadlineSet.stopWatching();
    });
    console.log('calling contract.withdrawal!')
    var ret = contract.withdrawal()
    console.log('called contract.withdrawal!', ret)
  }
})


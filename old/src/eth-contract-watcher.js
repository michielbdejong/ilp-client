const Web3 = require('web3')
web3 = new Web3(new Web3.providers.HttpProvider('http://geth:8545'))
var MyContract = web3.eth.contract(
[{"constant":false,"inputs":[{"name":"uuid","type":"bytes16"}],"name":"test","outputs":[{"name":"","type":"int8"}],"payable":true,"type":"function"},{"constant":false,"inputs":[{"name":"uuid","type":"bytes16"},{"name":"fulfillment","type":"bytes"}],"name":"fulfillTransfer","outputs":[{"name":"","type":"int8"}],"payable":true,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes16"}],"name":"memos","outputs":[{"name":"","type":"bytes"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes16"}],"name":"transfers","outputs":[{"name":"sender","type":"address"},{"name":"receiver","type":"address"},{"name":"amount","type":"uint256"},{"name":"condition","type":"bytes32"},{"name":"expiry","type":"uint256"},{"name":"state","type":"uint8"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"receiver","type":"address"},{"name":"condition","type":"bytes32"},{"name":"uuid","type":"bytes16"},{"name":"expiry","type":"uint256"},{"name":"data","type":"bytes"}],"name":"createTransfer","outputs":[{"name":"","type":"int8"}],"payable":true,"type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"name":"uuid","type":"bytes16"},{"indexed":false,"name":"state","type":"uint8"}],"name":"Update","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"uuid","type":"bytes16"},{"indexed":false,"name":"fulfillment","type":"bytes"}],"name":"Fulfill","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"msg","type":"string"}],"name":"Debug","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"msg","type":"string"},{"indexed":false,"name":"num","type":"uint256"}],"name":"DebugInt","type":"event"}]
)
var myContractInstance = MyContract.at('0x8b3fbd781096b51e68448c6e5b53b240f663199f')

// watch for an event with {some: 'args'}
var events = myContractInstance.allEvents({fromBlock: 0, toBlock: 'latest'})
events.watch(function(error, result) {
  console.log('event!', error, result)
})

// would get all past logs again.
events.get(function(error, logs){ 
  console.log('logs!', error, logs)
})

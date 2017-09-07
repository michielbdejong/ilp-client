# ilp-node
Testnet connector, see https://github.com/interledger/interledger/wiki/Interledger-over-CLP

In one screen:
```sh
$ npm install
$ node src/server-from-config-file
Listening on ws://localhost:8000/
```

In another:
```js
$ node scripts/genSecrets.js
$ cat config/clp.js
$ vim config/xrp.js
$ node scripts/flood.js 10000 clp clp
[ '/Users/michiel/.nvm/versions/node/v7.7.1/bin/node',
  '/Users/michiel/gh/michielbdejong/ilp-node/scripts/flood.js',
  '10000',
  'clp',
  'clp' ]
10000 transfers took 3058ms, that is 3270.1111837802487 payments per second.
```

## Connect to Amundsen

<img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Aan_de_Zuidpool_-_p1913-160.jpg">

```js
$ node scripts/genSecrets.js wss://amundsen.herokuapp.com rHrrxo57wXH5AqTgjq91cQCZCpiU16W5ps
$ cat config/clp.js
$ vim config/xrp.js
$ node scripts/flood.js 10000 clp clp
[ '/Users/michiel/.nvm/versions/node/v7.7.1/bin/node',
  '/Users/michiel/gh/michielbdejong/ilp-node/scripts/flood.js',
  '10000',
  'clp',
  'clp' ]
10000 transfers took 9044ms, that is 1105.7054400707652 payments per second.
```

## Send over ETH Rinkeby

In order to connect to ethereum, you need to be running a geth node; see
https://github.com/interledger/interledger/wiki/Interledger-over-ETH
for full instructions.

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
$ node scripts/flood.js 
100000 transfers took 34739ms, that is 2878.6090561040905 payments per second.
```

## Connect to Amundsen

<img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Aan_de_Zuidpool_-_p1913-160.jpg">

```js
$ node scripts/genSecrets.js wss://amundsen.herokuapp.com
$ cat config/clp.js
$ vim config/xrp.js
$ node scripts/flood.js 
100000 transfers took 34739ms, that is 2878.6090561040905 payments per second.
```


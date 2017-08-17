
```sh
# set CN to localhost, enter for all other questions:
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
npm install interledgerjs/clp-packet#mj-common-ledger-protocol
node index.js
```

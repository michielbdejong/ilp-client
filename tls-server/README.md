
```sh
# set CN to localhost, enter for all other questions:
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
node index.js
```

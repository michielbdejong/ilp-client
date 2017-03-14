var Client = require('ilp-client');
var passwords = require('./passwords');
var credentials = {};
Object.keys(passwords).map(host => {
  credentials[host] = {
   user: 'micmic',
   password: passwords[host],
 };
});
var client = new Client(credentials);
client.init().then(() => {
  console.log('hosts:', Object.keys(client.hosts));
  console.log('plugins:', Object.keys(client.plugins));
});


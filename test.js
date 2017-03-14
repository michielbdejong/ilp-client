var Client = require('ilp-client');
var passwords = require('./passwords');
var credentials = {};
Object.keys(passwords).map(host => {
  credentials[host] = {
   user: 'micmic',
   password: passwords[host],
 };
});
console.log(credentials);
var client = new Client(credentials);
client.init();

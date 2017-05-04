let fetch = require('node-fetch');

(async () => {
  try {
    // request
    let response = await fetch('http://localhost:8088/api/v1/hooy');
    // parsing
    let data = await response.json();
    console.log('data: ', data);
  } catch (error) {
    console.log('error: ', error);
  }
})(); // <--------- parenthesis should be like this.

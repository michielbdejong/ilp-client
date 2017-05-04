const fetch = require('node-fetch');

async function getHostInfo(hostname) {
  try {
    const webFingerUri = `https://${hostname}/.well-known/webfinger?resource=https://${hostname}`
    // request
    const response = await fetch(webFingerUri)
    // parsing
    const data = await response.json()
    console.log('data: ', data)
  } catch (error) {
    console.log('error: ', error)
  }
}

const config = require(../config.js)
console.log(config)
for (let hostname of config) {
  getHostInfo(hostname)
}

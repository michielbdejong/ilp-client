const tls = require('tls')
const fs = require('fs')
const talkClp = require('./talkClp')

const options = {
  // Necessary only if using the client certificate authentication
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),

  // Necessary only if the server uses the self-signed certificate
  ca: [ fs.readFileSync('cert.pem') ]
}

const socket = tls.connect(8000, options, () => {
  console.log('client connected',
              socket.authorized ? 'authorized' : 'unauthorized')
})

talkClp(socket)

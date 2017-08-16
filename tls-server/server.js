const tls = require('tls');
const fs = require('fs');
const ClpNode = require('./clp-node')

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),

  // This is necessary only if using the client certificate authentication.
  requestCert: true,

  // This is necessary only if the client uses the self-signed certificate.
  // ca: [ fs.readFileSync('client-cert.pem') ]
};

const server = tls.createServer(options, (socket) => {
  console.log('server connected',
              socket.authorized ? 'authorized' : 'unauthorized')
  clpNode = new ClpNode(socket)
  clpNode.talk()
})

server.listen(8000, () => {
  console.log('server bound');
})

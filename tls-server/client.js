const tls = require('tls')
const fs = require('fs')

const NUM = 10000000
let startTime

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
  
  startTime = new Date().getTime()
  for (let i=0; i<NUM; i++) {
   socket.write('0');
  }
});

let received = 0;
socket.on('data', function incoming(data) {
  if (++received === NUM) {
    let duration = (new Date().getTime() - startTime) / 1000.0
    console.log(NUM, duration, NUM/duration)
  }
});

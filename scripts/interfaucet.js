const ilpPacket = require('ilp-packet')
const getLetsEncryptServers = require('../src/letsencrypt')

getLetsEncryptServers('interfaucet.michielbdejong.com', (req, res) => {
  // '', 'fund', 'deadbeef'
  const parts = req.url.split('/')
  console.log('interfaucet request!', parts)
  const iprBuf = Buffer.from(parts[2], 'hex')
  const parsed = {
    version: iprBuf[0],
    packet: IlpPacket.deserializeIlpPayment(iprBuf.slice(1, iprBuf.length - 8)),
    condition: iprBuf.slice(-8)
  }
})

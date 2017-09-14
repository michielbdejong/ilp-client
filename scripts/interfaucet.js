const IlpNode = require('../src/index')
const IlpPacket = require('ilp-packet')
const getLetsEncryptServers = require('../src/letsencrypt')

const client = new IlpNode(require('../config/client1'))

client.start().then(() => {
getLetsEncryptServers('interfaucet.michielbdejong.com', (req, res) => {
  const parts = req.url.split('/')
  console.log('interfaucet request!', parts)
  const iprBuf = Buffer.from(parts[2], 'hex')
  const parsed = {
    version: iprBuf[0],
    packet: IlpPacket.deserializeIlpPayment(iprBuf.slice(1, iprBuf.length - 8)),
    condition: iprBuf.slice(-8)
  }
  client.getPeer('clp').interledgerPayment({
    amount: parsed.packet.amount,
    executionCondition: parsed.condition,
    expiresAt: new Date(new Date().getTime() + 3600 * 1000)
  }, parsed.packet).then(() => {
    res.end('SENT!')
  }, err => {
    res.end(JSON.stringify(err))
  })
})

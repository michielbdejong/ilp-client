const http = require('http')
const IlpNode = require('../src/index')
const IlpPacket = require('ilp-packet')

const client = new IlpNode({
  clp: {
    name: 'interfaucet',
    upstreams: [
      {
        url: 'wss://amundsen.michielbdejong.com/ilp-node-3/api/v1',
        token: process.env.TOKEN
      }
    ]
  }
})

client.start().then(() => {
  console.log('client started, starting webserver')
  const server = http.createServer((req, res) => {
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
  server.listen(process.env.PORT)
})

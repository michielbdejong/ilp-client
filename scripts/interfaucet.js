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
    Promise.resolve().then(() => {
      const parts = req.url.split('/')
      console.log('interfaucet request!', parts)
      const iprBuf = Buffer.from(parts[2], 'hex')
      return {
        version: iprBuf[0],
        packet: iprBuf.slice(1, iprBuf.length - 32),
        condition: iprBuf.slice(-32)
      }
    }).then((ipr) => {
      console.log('ipr', JSON.stringify(ipr))
      const ipp = IlpPacket.deserializeIlpPayment(ipr.packet)
      console.log('ipp', JSON.stringify(ipp))
      return client.getPeer('clp').interledgerPayment({
        amount: parseInt(ipp.amount),
        executionCondition: ipr.condition,
        expiresAt: new Date(new Date().getTime() + 3600 * 1000)
      }, ipr.packet)
    }).then(() => {
      res.end('SENT!')
    }, err => {
      res.end(JSON.stringify(err))
    })
  })
  server.listen(process.env.PORT)
})

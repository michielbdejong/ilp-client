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
        packet: iprBuf.slice(1, iprBuf.length - 8),
        condition: iprBuf.slice(-8)
      }
    }).then((ipr) => {
      return client.getPeer('clp').interledgerPayment({
        amount = parseInt(IlpPacket.deserializeIlpPayment(ipr.packet).amount),
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

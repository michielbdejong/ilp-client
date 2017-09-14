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
      res.end('<html><img src="https://i.pinimg.com/564x/88/84/85/888485cae122717788328b4486803a32.jpg"></html>')
    }, err => {
      console.log(err, err.message)
      res.end('<html><img src="https://i.pinimg.com/736x/fa/d2/76/fad27608b9bd588fe18231e2babe2b5f--man-faces-strange-places.jpg"></html>')
    })
  })
  server.listen(process.env.PORT)
})

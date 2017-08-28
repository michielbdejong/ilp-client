const WebSocket = require('ws');
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')

const NUM = 10
let startTime
const ws = new WebSocket('ws://localhost:8000/path', {
  perMessageDeflate: false
});

ws.on('open', function open() {
  startTime = new Date().getTime()
  for (let i=0; i<NUM; i++) {
    const buf = ClpPacket.serialize({
      type: ClpPacket.TYPE_MESSAGE,
      requestId: i,
      data: {
        protocolData: [
          {
             protocolName: 'ilp',
             contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
             data: IlpPacket.serializeIlqpByDestinationRequest({
               destinationAccount: 'example.nexus.bob',
               destinationAmount: '9000000000',
               destinationHoldDuration: 3000
             })
           }
        ]
      }
    })
    ws.send(buf);
  }
});

let received = 0
let fail = 0

ws.on('message', function incoming(buf) {
  let obj = ClpPacket.deserialize(buf)
  console.log('got reply!', obj)
  if (obj.type === ClpPacket.TYPE_ERROR) {
    fail++
  } else {
    const json = IlpPacket.deserializeIlqpByDestinationResponse(obj.data.protocolData[0].data)
    console.log(json)
  }
  if (++received === NUM) {
    let duration = (new Date().getTime() - startTime) / 1000.0
    console.log(NUM, duration, NUM/duration)
  }
});

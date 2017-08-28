const WebSocket = require('ws');
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const Quoter = require('./quoter')
const wss = new WebSocket.Server({ port: 8000 });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(buf) {
    const obj = ClpPacket.deserialize(buf)
    let responseObj = {
      type: ClpPacket.TYPE_ACK,
      requestId: obj.requestId,
      data: {
        protocolData: []
      }
    }
    // console.log('responding to:', JSON.stringify(obj), typeof obj.data.protocolData[0].protocolName, obj.data.protocolData[0].protocolName.length)
    if (obj.type === ClpPacket.TYPE_MESSAGE && obj.data.protocolData[0].protocolName === 'ilp') {
      // console.log('ilp message!')
      const request = IlpPacket.deserializeIlpPacket(obj.data.protocolData[0].data)
      switch(request.type) {
      case IlpPacket.Type.TYPE_LIQUIDITY_REQUEST:
        responseObj.type = ClpPacket.TYPE_RESPONSE
        responseObj.data.protocolData.push({
          protocolName: 'ilp',
          contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
          data: IlpPacket.serializeIlqpLiquidityResponse(answerQuoteLiquidity(request.packet))
        })
      break
      case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST:
        responseObj.type = ClpPacket.TYPE_RESPONSE
        responseObj.data.protocolData.push({
          protocolName: 'ilp',
          contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
          data: IlpPacket.serializeIlqpBySourceResponse(answerQuoteBySource(request.packet))
        })
      break
      case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST:
        responseObj.type = ClpPacket.TYPE_RESPONSE
        responseObj.data.protocolData.push({
          protocolName: 'ilp',
          contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
          data: IlpPacket.serializeIlqpByDestinationResponse(answerQuoteByDest(request.packet))
        })
      break
      default:
        throw new Error('unrecognized ilp packet type')
      }
    }
    ws.send(ClpPacket.serialize(responseObj));
  });

});


const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')

function Peer(ledgerPrefix, initialBalance, ws, quoter, forwarder)
  this.ledgerPrefix = ledgerPrefix
  this.quoter = quoter
  this.forwarder = forwarder
  this.balance = initialBalance // ledger units this node owes to that peer
  this.requestsSent = {}
  this.transfersSent = {}
  ws.on('message', this.incoming.bind(this))
}

Peer.prototype = {
  incoming(buf) {
    const obj = ClpPacket.deserialize(buf)
    let responseObj = {
      type: ClpPacket.TYPE_ACK,
      requestId: obj.requestId,
      data: {
        protocolData: []
      }
    }
    console.log('responding to:', JSON.stringify(obj), typeof obj.data.protocolData[0].protocolName, obj.data.protocolData[0].protocolName.length)
    switch(obj.type) {
    case ClpPacket.TYPE_MESSAGE:
      if(obj.data.protocolData[0].protocolName === 'ilp') {
        // console.log('ilp message!')
        const request = IlpPacket.deserializeIlpPacket(obj.data.protocolData[0].data)
        switch(request.type) {
        case IlpPacket.Type.TYPE_LIQUIDITY_REQUEST:
          responseObj.type = ClpPacket.TYPE_RESPONSE
          responseObj.data.protocolData.push({
            protocolName: 'ilp',
            contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
            data: IlpPacket.serializeIlqpLiquidityResponse(this.quoter.answerLiquidity(request.packet))
          })
        break
        case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST:
          responseObj.type = ClpPacket.TYPE_RESPONSE
          responseObj.data.protocolData.push({
            protocolName: 'ilp',
            contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
            data: IlpPacket.serializeIlqpBySourceResponse(this.quoter.answerBySource(request.packet))
          })
        break
        case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST:
          responseObj.type = ClpPacket.TYPE_RESPONSE
          responseObj.data.protocolData.push({
            protocolName: 'ilp',
            contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
            data: IlpPacket.serializeIlqpByDestinationResponse(this.answerByDest(request.packet))
          })
        break
        default:
          throw new Error('unrecognized ilp packet type')
        }
      }
      ws.send(ClpPacket.serialize(responseObj));
    break
    case ClpPacket.TYPE_PREPARE:
      if (obj.data.amount > this.balance) {
        responseObj.type = ClpPacket.TYPE_ERROR
        responseObj.data.rejectionReason = IlpPacket.serializeIlpError({
          code: 'L01',
          name: 'Account balance lower than transfer amount',
          triggeredBy: this.ledgerPrefix + 'me'
          forwardedBy: [
          ],
          triggeredAt: new Date(),
          data: JSON.stringify({
          })
        })
        ws.send(ClpPacket.serialize(responseObj))
        return
      }
      // adjust balance
      this.balance -= obj.data.amount
      ws.send(ClpPacket.serialize(responseObj)) // ACK
      this.forwarder.forward({ // transfer
        amount: obj.data.amount,
        executionCondition: obj.data.executionCondition,
        expiresAt: obj.data.expiresAt
      }, obj.data.protocolData[0].data).then((fulfillment) => {
        responseObj.type = ClpPacket.TYPE_FULFILL
        responseObj.requestId = uuid() // fulfill is a new request
        responseObj.data.transferId = obj.data.transferId
        responseObj.data.fulfillment = fulfillment
        ws.send(ClpPacket.serialize(responseObj))
      }, (error) => {
        responseObj.type = ClpPacket.TYPE_REJECT
        responseObj.requestId = uuid() // reject is a new request
        responseObj.data.transferId = obj.data.transferId
        responseObj.data.rejectionReason = IlpPacket.serializeIlpError({
          code: 'F02',
          name: 'Unreachable',
          triggeredBy: this.ledgerPrefix + 'me'
          forwardedBy: [
          ],
          triggeredAt: new Date(),
          data: JSON.stringify({
          })
        })
        ws.send(ClpPacket.serialize(responseObj))
        // refund balance
        this.balance += obj.data.amount
      })
        
    break
  })
}
  

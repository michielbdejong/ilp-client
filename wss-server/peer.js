
const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')

function Peer(ledgerPrefix, initialBalance, ws, quoter, forwarder) {
  this.ledgerPrefix = ledgerPrefix
  this.quoter = quoter
  this.forwarder = forwarder
  this.balance = initialBalance // ledger units this node owes to that peer
  this.requestsSent = {}
  this.transfersSent = {}
  ws.on('message', this.incoming.bind(this))
}

Peer.prototype = {
  sendCall(type, requestId, data) {
    ws.send(ClpPacket.serialize({ type, requestId, data }))
  },

  sendError(requestId, err) {
    this.sendCall(ClpPacket.TYPE_ERROR, requestId, {
      rejectionReason: err,
      protocolData: []
    })
  },

  // this function may still change due to https://github.com/interledger/rfcs/issues/282
  sendLedgerError(requestId, name) {
    const codes = {
      'account balance lower than transfer amount': 'L01',
      'empty message': 'L02',
      'first protocol unsupported': 'L03'
    }
    this.sendError(requestId, IlpPacket.serializeIlpError({
      code: codes[name],
      name,
      triggeredBy: this.ledgerPrefix + 'me',
      forwardedBy: [],
      triggeredAt: new Date(),
      data: JSON.stringify({})
    }))
  },

  handleIlqpRequest(ilpPacketBuf) {
    // console.log('ilp message!')
    const request = IlpPacket.deserializeIlpPacket(ilpPacketBuf)
    switch(request.type) {
    case IlpPacket.Type.TYPE_LIQUIDITY_REQUEST:
      return IlpPacket.serializeIlqpLiquidityResponse(this.quoter.answerLiquidity(request.packet))
    case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST:
      return IlpPacket.serializeIlqpBySourceResponse(this.quoter.answerBySource(request.packet))
    case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST:
      return IlpPacket.serializeIlqpByDestinationResponse(this.answerByDest(request.packet))
    default:
      throw new Error('unrecognized ilp packet type')
    }
  },

  sendResult(requestId, protocolName, result) {
    if (protocolName) { // RESPONSE
      this.sendCall(ClpPacket.TYPE_RESPONSE, requestId, [
        {
          protocolName: 'ilp',
          contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
          data: result
        }
      ])
    } else { // ACK
      // uncomment this if https://github.com/interledger/rfcs/issues/283 gets adopted:
      // this.sendCall(ClpPacket.TYPE_RESPONSE, requestId, [])
      this.sendCall(ClpPacket.TYPE_ACK, requestId, [])
    }
  },

  sendFulfillment(transferId, fulfillment) {
    // fulfill is a new request
    const requestId = uuid()
    this.requestsSent[requestId] = {
      resolve() {},
      reject() {}
    }
    this.sendCall(ClpPacket.TYPE_FULFILL, requestId, {
        transferId,
        fulfillment,
        protocolData: []
    })
  },

  sendReject(transferId, err) { 
    // reject is a new request
    const requestId = uuid()
    this.requestsSent[requestId] = {
      resolve() {},
      reject() {}
    }
    this.sendCall(ClpPacket.TYPE_REJECT, requestId, {
      transferId,
      rejectionReason: IlpPacket.serializeIlpError({
        code: 'F02',
        name: 'Unreachable',
        triggeredBy: this.ledgerPrefix + 'me',
        forwardedBy: [
        ],
        triggeredAt: new Date(),
        data: JSON.stringify({
        })
      }),
      protocolData: []
    })
  },

  incoming(buf) {
    const obj = ClpPacket.deserialize(buf)
    console.log('responding to:', JSON.stringify(obj), typeof obj.data.protocolData[0].protocolName, obj.data.protocolData[0].protocolName.length)
    switch(obj.type) {
    case ClpPacket.TYPE_MESSAGE:
      if (!Array.isArray(obj.data) || !obj.data.length) {
        this.sendLedgerError(requestId, 'empty message')
        return
      }

      if(obj.data[0].protocolName !== 'ilp') {
        this.sendLedgerError(requestId, 'first protocol unsupported')
        return
      }

      this.handleIlqpRequest(obj.data[0].data).then(result => {
        this.sendResult(requestId, obj.data[0].protocolName, result)
      }, err => {
        this.sendError(requestId, err)
      })
    break
    case ClpPacket.TYPE_PREPARE:
      if (obj.data.amount > this.balance) {
        this.sendLedgerError(requestId, 'account balance lower than transfer amount')
        return
      }
      // adjust balance
      this.balance -= obj.data.amount
      this.sendResult(requestId) // ACK
      this.forwarder.forward({ // transfer
        amount: obj.data.amount,
        executionCondition: obj.data.executionCondition,
        expiresAt: obj.data.expiresAt
      }, obj.data.protocolData[0].data).then((fulfillment) => {
        this.sendFulfillment(transferId, fulfillment) 
      }, (err) => {
        this.sendReject(transferId, err)
        // refund balance
        this.balance += obj.data.amount
      })
    break
    case ClpPacket.ACK:
      this.requestsSent[obj.requestId].resolve()
    break
    case ClpPacket.RESPONSE:
      if (Array.isArray(obj.data) && obj.data.length) {
      this.requestsSent[obj.requestId].resolve(obj.data[0])
      } else { // treat it as an ACK, see https://github.com/interledger/rfcs/issues/283
        this.requestsSent[obj.requestId].resolve()
      }
    break
    case ClpPacket.TYPE_ERROR:
      this.requestsSent[obj.requestId].reject(obj.data.rejectionReason)
    break
    case ClpPacket.TYPE_FULFILL:
      if (typeof this.transfersSent[obj.data.transferId] === undefined) {
        this.sendLedgerError(obj.requestId, 'unknown transfer id')
      } else if (new Date().getTime() > this.transfersSent[obj.data.transferId].expiresAt) { // FIXME: this is not leap second safe (but not a problem if MIN_MESSAGE_WINDOW is at least 1 second)
        this.sendLedgerError(obj.requestId, 'fulfilled too late')
      } else if (sha256(obj.data.fulfillment) !== this.transfersSent[obj.data.transferId].condition) {
        this.sendLedgerError(obj.requestId, 'fulfillment incorrect')
      } else {
        this.transfersSent[obj.data.transferId].resolve(obj.data.fulfillment)
        this.balance += this.transfersSent[obj.data.transferId].amount
        this.sendResult(obj.requestId) // ACK
      }
    break
    case ClpPacket.TYPE_REJECT:
      if (typeof this.transfersSent[obj.data.transferId] === undefined) {
        this.sendLedgerError(obj.requestId, 'unknown transfer id')
      } else {
        this.transfersSent[obj.data.transferId].reject(obj.data.rejectionReason)
        this.sendResult(obj.requestId) // ACK
      }
    default:
      throw new Error('clp packet type not recognized')
    }
  },
  unpaid(protocolName, data) {
    const requestId = uuid()
    this.sendMessage(requestId, [
      {
        protocolName,
        contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
        data
      }
    ])

    return new Promise((resolve, reject) => {
      this.requestsSent[requestId] = { resolve, reject }
    })
  },

  conditional(transfer, protocolData) {
    const requestId = uuid()
    const transferId = uuid()
    this.requestsSent[requestId] = {
      resolve() {
        setTimeout(() => { // not sure if this works for deleting the entry
          delete this.requestsSent[requestId]
        }, 0)
      },
      reject(err) {
        // if the PREPARE failed, the whole transfer fails:
        this.transfersSent[transferId].reject(err)
        setTimeout(() => { // not sure if this works for deleting the entry
          delete this.requestsSent[requestId]
        }, 0)
      }
    }
   this.sendPrepare(requestId, {
      transferId,
      amount: transfer.amount,
      expiresAt: transfer.expiresAt,
      executionCondition: transfer.executionCondition,
      protocolData
    })
    return new Promise((resolve, reject) => {
      this.transfersSent[transferId] = { resolve, reject }
    })
  },

  interledgerPayment(transfer, payment) {
    return this.conditional(transfer, [
      {
        ilp: payment
      }
    ])
  }
}

module.exports = Peer

const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const uuid = require('uuid/v4')
const crypto = require('crypto')

const BalancePacket = {
   serializeResponse(num) {
     let prefix = '0208' + '0000' + '0000' + '0000' + '0000'
     let suffix = num.toString(16)
     return Buffer.from(prefix.substring(0, prefix.length - suffix.length) + suffix, 'hex')
   }
}
const InfoPacket = {
   serializeResponse(info) {
     if (info.length < 128) {
       return Buffer.concat([ Buffer.from([ 2, info.length ]), Buffer.from(info, 'ascii') ])
     } else {
       // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
       const lenLen = 128 + 2
       const lenLo = info.length % 256
       const lenHi = (info.length - lenLo) / 256
       return Buffer.concat([ Buffer.from([ 2, lenLen, lenHi, lenLo ]), Buffer.from(info, 'ascii') ])
     }
  }
}

const CppPacket = {
  deserialize(dataBuf) {
    let lenLen = 1
    if (dataBuf[0] >= 128) {
      // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
      lenLen = 1 + (dataBuf[0]-128)
    }
    let obj
    try {
      obj = JSON.parse(dataBuf.slice(lenLen).toString('ascii'))
    } catch(e) {
    }
    return obj
  }
}

const VouchPacket = {
  deserialize(dataBuf) {
    let lenLen = 1
    let addressLen = dataBuf[1]
    if (dataBuf[1] >= 128) {
      // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
      lenLen = 1 + (dataBuf[0]-128)
      // TODO: write unit tests for this code and see if we can use it to
      // read the address, condition, and amount of a rollback
      addressLen = 0
      cursor = 2
      switch (lenLen) {
        case 7: addressLen = addressLen * 256 + dataBuf[cursor++]
        case 6: addressLen = addressLen * 256 + dataBuf[cursor++]
        case 5: addressLen = addressLen * 256 + dataBuf[cursor++]
        case 4: addressLen = addressLen * 256 + dataBuf[cursor++]
        case 3: addressLen = addressLen * 256 + dataBuf[cursor++]
        case 2: addressLen = addressLen * 256 + dataBuf[cursor++]
        case 1: addressLen = addressLen * 256 + dataBuf[cursor++]
      }
    }
    console.log(dataBuf, lenLen, dataBuf.slice(lenLen))
    return {
      callId: dataBuf[0], // 1: 'vouch for', 2: 'reach me at', 3: 'roll back'
      address: dataBuf.slice(1 + lenLen).toString('ascii')
      //TODO: report condition and amount in case callId is 'roll back', and
      //stop them from being concatenated as bytes at the end of the address.
    }
  }
}

function Peer(baseLedger, peerName, initialBalance, ws, quoter, forwarder, fulfiller, voucher) {
  this.requestIdUsed = 0
  this.baseLedger = baseLedger
  this.peerName = peerName
  this.quoter = quoter
  this.forwarder = forwarder
  this.fulfiller = fulfiller
  this.voucher = voucher
  this.balance = initialBalance // ledger units this node owes to that peer
  this.requestsSent = {}
  this.transfersSent = {}
  this.ws = ws
  // listen for incoming CLP messages:
  this.ws.on('message', this.incoming.bind(this))
}

Peer.prototype = {
  sendCall(type, requestId, data) {
    // console.log('sendCall', {type, requestId, data })
    this.ws.send(ClpPacket.serialize({ type, requestId, data }))
  },

  sendError(requestId, err) {
    this.sendCall(ClpPacket.TYPE_ERROR, requestId, {
      rejectionReason: err,
      protocolData: []
    })
  },

  // this function may still change due to https://github.com/interledger/rfcs/issues/282
  makeLedgerError(name) {
    const codes = {
      'account balance lower than transfer amount': 'L01',
      'empty message': 'L02',
      'first protocol unsupported': 'L03',
      'unknown call id': 'P01' // same for all protocols
    }
    return IlpPacket.serializeIlpError({
      code: codes[name],
      name,
      triggeredBy: this.baseLedger + 'me',
      forwardedBy: [],
      triggeredAt: new Date(),
      data: JSON.stringify({})
    })
  },

  handleProtocolRequest(protocolName, dataBuf) {
    switch (protocolName) {
      case 'ilp':
        const request = IlpPacket.deserializeIlpPacket(dataBuf)
        // console.log('ilp message!', request)
        switch (request.type) {
        case IlpPacket.Type.TYPE_ILQP_LIQUIDITY_REQUEST:
          return this.quoter.answerLiquidity(request.data).then(IlpPacket.serializeIlqpLiquidityResponse)
        case IlpPacket.Type.TYPE_ILQP_BY_SOURCE_REQUEST:
          return this.quoter.answerBySource(request.data).then(IlpPacket.serializeIlqpBySourceResponse)
        case IlpPacket.Type.TYPE_ILQP_BY_DESTINATION_REQUEST:
          return this.answerByDest(request.data).then(IlpPacket.serializeIlqpByDestinationResponse)
        }
        return Promise.reject(this.makeLedgerError('unknown call id'))

      case 'info':
        if (dataBuf[0] === 0) {
          // console.log('info!', dataBuf)
          return Promise.resolve(InfoPacket.serializeResponse(this.baseLedger + this.peerName))
        }
        return Promise.reject(this.makeLedgerError('unknown call id'))

      case 'balance':
        if (dataBuf[0] === 0) {
          // console.log('balance!', dataBuf)
          return Promise.resolve(BalancePacket.serializeResponse(this.balance))
        }
        return Promise.reject(this.makeLedgerError('unknown call id'))

      case 'cpp':
        console.log('received route broadcast!', CppPacket.deserialize(dataBuf))
        return Promise.resolve() // ack

      case 'vouch':
        const obj = VouchPacket.deserialize(dataBuf)
        console.log('received vouch!', obj)
        return this.voucher(obj.address)

      default:
        return Promise.reject(this.makeLedgerError('first protocol unsupported'))
    }
  },

  sendResult(requestId, protocolName, result) {
    // console.log('sendResult(', {requestId, protocolName, result})
    if (result) { // RESPONSE
      this.sendCall(ClpPacket.TYPE_RESPONSE, requestId, [
        {
          protocolName,
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
    const requestId = ++this.requestIdUsed
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
    const requestId = ++this.requestIdUsed
    this.requestsSent[requestId] = {
      resolve() {},
      reject() {}
    }
    this.sendCall(ClpPacket.TYPE_REJECT, requestId, {
      transferId,
      rejectionReason: IlpPacket.serializeIlpError({
        code: 'F02',
        name: 'Unreachable',
        triggeredBy: this.baseLedger + 'me',
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
 
    // console.log('incoming:', JSON.stringify(obj))
    switch(obj.type) {
      case ClpPacket.TYPE_ACK:
        // console.log('TYPE_ACK!')
        this.requestsSent[obj.requestId].resolve()
        break

      case ClpPacket.TYPE_RESPONSE:
        // console.log('TYPE_RESPONSE!')
        if (Array.isArray(obj.data) && obj.data.length) {
        this.requestsSent[obj.requestId].resolve(obj.data[0])
        } else { // treat it as an ACK, see https://github.com/interledger/rfcs/issues/283
          this.requestsSent[obj.requestId].resolve()
        }
        break

      case ClpPacket.TYPE_ERROR:
        // console.log('TYPE_ERROR!')
        this.requestsSent[obj.requestId].reject(obj.data.rejectionReason)
        break

      case ClpPacket.TYPE_PREPARE:
        // console.log('TYPE_PREPARE!')
        if (obj.data.amount > this.balance) {
          // console.log('too poor!', obj, this.balance)
          this.sendError(obj.requestId, this.makeLedgerError('account balance lower than transfer amount'))
          return
        }
        // adjust balance
        this.balance -= obj.data.amount
        this.sendResult(obj.requestId) // ACK
        let paymentPromise
        if (this.fulfiller) {
          // console.log('trying the fulfiller!')
          const fulfillment = this.fulfiller(obj.data.executionCondition)
          if (fulfillment) {
            paymentPromise = Promise.resolve(fulfillment)
          }
          // console.log(fulfillment)
        }
        if (!paymentPromise) {
          // console.log('forwarding payment', obj)
          paymentPromise = this.forwarder.forward({ // transfer
            amount: obj.data.amount,
            executionCondition: obj.data.executionCondition,
            expiresAt: obj.data.expiresAt
          }, obj.data.protocolData[0].data)
        }
        const replyRequestId = ++this.requestIdUsed
        this.requestsSent[replyRequestId] = {
          resolve() {},
          reject() {}
        }
        paymentPromise.then((fulfillment) => {
          // console.log('sending fulfill call')
          this.sendCall(ClpPacket.TYPE_FULFILL, replyRequestId, {
            transferId: obj.data.transferId,
            fulfillment,
            protocolData: []
          }) 
        }, (err) => {
          this.sendCall(ClpPacket.TYPE_REJECT, replyRequestId, {
            transferId: obj.data.transferId,
            rejectionReason: err,
            protocolData: []
          })
          // refund balance
          this.balance += obj.data.amount
        })
        break

      case ClpPacket.TYPE_FULFILL:
        function sha256(fulfillmentHex) {
          // console.log({ fulfillmentHex })
          const fulfillment = Buffer.from(fulfillmentHex, 'hex')
          const condition = crypto.createHash('sha256').update(fulfillment).digest()
          // console.log(fulfillment, condition)
          return condition
        }
        // console.log('TYPE_FULFILL!')
        if (typeof this.transfersSent[obj.data.transferId] === undefined) {
          this.sendError(obj.requestId, this.makeLedgerError('unknown transfer id'))
        } else if (new Date().getTime() > this.transfersSent[obj.data.transferId].expiresAt) { // FIXME: this is not leap second safe (but not a problem if MIN_MESSAGE_WINDOW is at least 1 second)
          this.sendError(obj.requestId, this.makeLedgerError('fulfilled too late'))
        } else if (sha256(obj.data.fulfillment).toString('hex') !== this.transfersSent[obj.data.transferId].conditionHex) {
          // console.log('compared!', sha256(obj.data.fulfillment).toString('hex'), this.transfersSent[obj.data.transferId].conditionHex)
          this.sendError(obj.requestId, this.makeLedgerError('fulfillment incorrect'))
        } else {
          this.transfersSent[obj.data.transferId].resolve(obj.data.fulfillment)
          this.balance += this.transfersSent[obj.data.transferId].amount
          this.sendResult(obj.requestId) // ACK
        }
        break

      case ClpPacket.TYPE_REJECT:
        // console.log('TYPE_REJECT!')
        if (typeof this.transfersSent[obj.data.transferId] === undefined) {
          this.sendError(obj.requestId, this.makeLedgerError('unknown transfer id'))
        } else {
          this.transfersSent[obj.data.transferId].reject(obj.data.rejectionReason)
          this.sendResult(obj.requestId) // ACK
        }
        break

      case ClpPacket.TYPE_MESSAGE:
        // console.log('TYPE_MESSAGE!')
        if (!Array.isArray(obj.data) || !obj.data.length) {
          this.sendError(requestId, this.makeLedgerError('empty message'))
          return
        }
        // console.log('first entry', obj.data[0])

        this.handleProtocolRequest(obj.data[0].protocolName, obj.data[0].data).then(result => {
          console.log('sendind back result!', obj, result)
          this.sendResult(obj.requestId, obj.data[0].protocolName, result)
        }, err => {
          console.log('sendind back err!', err)
          this.sendError(requestId, err)
        })
        break

      default:
        throw new Error('clp packet type not recognized')
    }
  },
  unpaid(protocolName, data) {
    // console.log('unpaid', protocolName, data)
    const requestId = ++this.requestIdUsed
    this.sendCall(ClpPacket.TYPE_MESSAGE, requestId, [
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
    const requestId = ++this.requestIdUsed
    const transferId = uuid()
    this.requestsSent[requestId] = {
      resolve() {
        setTimeout(() => { // not sure if this works for deleting the entry
          // delete this.requestsSent[requestId]
        }, 0)
      },
      reject(err) {
        // console.log('prepare was rejected!', err)
        // if the PREPARE failed, the whole transfer fails:
        this.transfersSent[transferId].reject(err)
        setTimeout(() => { // not sure if this works for deleting the entry
          delete this.requestsSent[requestId]
        }, 0)
      }
    }
   this.sendCall(ClpPacket.TYPE_PREPARE, requestId, {
      transferId,
      amount: transfer.amount,
      expiresAt: transfer.expiresAt,
      executionCondition: transfer.executionCondition,
      protocolData
    })
    return new Promise((resolve, reject) => {
      this.transfersSent[transferId] = { resolve, reject, conditionHex: transfer.executionCondition.toString('hex') }
    })
  },

  interledgerPayment(transfer, payment) {
    return this.conditional(transfer, [
      {
        protocolName: 'ilp',
        contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
        data: payment
      }
    ])
  }
}

module.exports = Peer

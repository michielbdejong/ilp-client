const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')
const uuid = require('uuid/v4')
const sha256 = require('./sha256')

function assertType (x, typeName) {
  if (typeof x === typeName) { return } // eslint-disable-line valid-typeof
  throw new Error(JSON.stringify(x) + ' is not a ' + typeName)
}

function assertClass (x, className) {
  if (x instanceof className) { return }
  throw new Error(JSON.stringify(x) + ' is not a ' + className)
}

function Clp (baseLedger, initialBalance, ws, protocolHandlers) {
  this.baseLedger = baseLedger
  this.requestIdUsed = 0
  this.balance = initialBalance // ledger units this node owes to that peer
  this.requestsSent = {}
  this.transfersSent = {}
  this.ws = ws
  this.protocolHandlers = protocolHandlers
  // listen for incoming CLP messages:
  this.ws.on('message', this.incoming.bind(this))
}

Clp.prototype = {
  sendCall (type, requestId, data) {
    console.log('sendCall', { type, requestId, data })
    this.ws.send(ClpPacket.serialize({ type, requestId, data }))
  },

  sendError (requestId, err) {
    console.error('SENDING ERROR', err, typeof err)
    this.sendCall(ClpPacket.TYPE_ERROR, requestId, {
      rejectionReason: err,
      protocolData: []
    })
  },

  // this function may still change due to https://github.com/interledger/rfcs/issues/282
  makeLedgerError (name) {
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

  sendResult (requestId, protocolName, result) {
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

  sendFulfillment (transferId, fulfillment) {
    // fulfill is a new request
    const requestId = ++this.requestIdUsed
    this.requestsSent[requestId] = {
      resolve () {},
      reject () {}
    }
    this.sendCall(ClpPacket.TYPE_FULFILL, requestId, {
      transferId,
      fulfillment,
      protocolData: []
    })
  },

  sendReject (transferId, err) {
    // reject is a new request
    const requestId = ++this.requestIdUsed
    this.requestsSent[requestId] = {
      resolve () {},
      reject () {}
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

  incoming (buf) {
    assertClass(buf, Buffer)

    const obj = ClpPacket.deserialize(buf)
    assertType(obj.type, 'number')
    assertType(obj.requestId, 'number')
    assertType(obj.data, 'object')

    // console.log('incoming:', JSON.stringify(obj))
    switch (obj.type) {
      case ClpPacket.TYPE_ACK:
        // console.log('TYPE_ACK!')
        this.requestsSent[obj.requestId].resolve()
        delete this.requestsSent[obj.requestId]
        break

      case ClpPacket.TYPE_RESPONSE:
        // console.log('TYPE_RESPONSE!', obj)
        if (Array.isArray(obj.data) && obj.data.length) {
          this.requestsSent[obj.requestId].resolve(obj.data[0])
        } else { // treat it as an ACK, see https://github.com/interledger/rfcs/issues/283
          this.requestsSent[obj.requestId].resolve()
        }
        delete this.requestsSent[obj.requestId]
        break

      case ClpPacket.TYPE_ERROR:
        // console.log('TYPE_ERROR!')
        this.requestsSent[obj.requestId].reject(obj.data.rejectionReason)
        delete this.requestsSent[obj.requestId]
        break

      case ClpPacket.TYPE_PREPARE:
        // console.log('TYPE_PREPARE!')
        if (obj.data.amount > this.balance) {
          // console.log('too poor!', obj, this.balance)
          this.sendError(obj.requestId, this.makeLedgerError('account balance lower than transfer amount'))
          return
        }
        // adjust balance
        // console.log('BALANCE DEC', obj.data)
        this.balance -= obj.data.amount
        this.sendResult(obj.requestId) // ACK

        const replyRequestId = ++this.requestIdUsed
        this.requestsSent[replyRequestId] = {
          resolve () {},
          reject () {}
        }

        this.handleProtocolRequest(obj.data.protocolData[0].protocolName, obj.data.protocolData[0].data, { // transfer
          amount: obj.data.amount,
          executionCondition: obj.data.executionCondition,
          expiresAt: obj.data.expiresAt
        }).then((fulfillment) => {
          // console.log('sending fulfill call, paymentPromise gave:', fulfillment)
          this.sendCall(ClpPacket.TYPE_FULFILL, replyRequestId, {
            transferId: obj.data.transferId,
            fulfillment,
            protocolData: []
          })
        }, (err) => {
          console.error('could not handle protocol request from PREPARE', err)
          this.sendCall(ClpPacket.TYPE_REJECT, replyRequestId, {
            transferId: obj.data.transferId,
            rejectionReason: err,
            protocolData: []
          })
          // refund balance
          // console.log('BALANCE INC', obj.data)
          this.balance += obj.data.amount
        })
        break

      case ClpPacket.TYPE_FULFILL:
        const conditionCheck = sha256(obj.data.fulfillment)
        // console.log('TYPE_FULFILL!', obj.data, conditionCheck , this.transfersSent[obj.data.transferId].condition)
        if (typeof this.transfersSent[obj.data.transferId] === 'undefined') {
          this.sendError(obj.requestId, this.makeLedgerError('unknown transfer id'))
        } else if (new Date().getTime() > this.transfersSent[obj.data.transferId].expiresAt) { // FIXME: this is not leap second safe (but not a problem if MIN_MESSAGE_WINDOW is at least 1 second)
          this.sendError(obj.requestId, this.makeLedgerError('fulfilled too late'))
        } else if (conditionCheck.compare(this.transfersSent[obj.data.transferId].condition) !== 0) {
          // console.log('compared!', conditionCheck, this.transfersSent[obj.data.transferId].condition)
          this.sendError(obj.requestId, this.makeLedgerError('fulfillment incorrect'))
        } else {
          this.transfersSent[obj.data.transferId].resolve(obj.data.fulfillment)
          // console.log('BALANCE INC', this.transfersSent[obj.data.transferId].amount)
          this.balance += this.transfersSent[obj.data.transferId].amount
          delete this.transfersSent[obj.data.transferId]
          this.sendResult(obj.requestId) // ACK
        }
        break

      case ClpPacket.TYPE_REJECT:
        // console.log('TYPE_REJECT!')
        if (typeof this.transfersSent[obj.data.transferId] === 'undefined') {
          this.sendError(obj.requestId, this.makeLedgerError('unknown transfer id'))
        } else {
          this.transfersSent[obj.data.transferId].reject(obj.data.rejectionReason)
          delete this.transfersSent[obj.data.transferId]
          this.sendResult(obj.requestId) // ACK
        }
        break

      case ClpPacket.TYPE_MESSAGE:
        // console.log('TYPE_MESSAGE!')
        if (!Array.isArray(obj.data) || !obj.data.length) {
          this.sendError(obj.requestId, this.makeLedgerError('empty message'))
          return
        }
        // console.log('first entry', obj.data[0])

        this.handleProtocolRequest(obj.data[0].protocolName, obj.data[0].data).then(result => {
          // console.log('sendind back result!', obj, result)
          this.sendResult(obj.requestId, obj.data[0].protocolName, result)
        }, err => {
          console.error('could not handle protocol request from MESSAGE')
          // console.log('sendind back err!', err)
          this.sendError(obj.requestId, err)
        })
        break

      default:
        throw new Error('clp packet type not recognized')
    }
  },
  unpaid (protocolName, data) {
    assertType(protocolName, 'string')
    assertClass(data, Buffer)

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

  conditional (transfer, protocolData) {
    console.log('conditional', transfer, protocolData)
    // console.log('asserting')
    assertType(transfer.amount, 'number')
    assertClass(transfer.executionCondition, Buffer)
    assertClass(transfer.expiresAt, Date)

    // console.log('conditional(', {transfer, protocolData})
    const requestId = ++this.requestIdUsed
    const transferId = uuid()
    this.requestsSent[requestId] = {
      resolve: function () {
        setTimeout(() => { // not sure if this works for deleting the entry
          // delete this.requestsSent[requestId]
        }, 0)
      },
      reject: function (err) {
        // console.log('prepare was rejected!', err)
        // if the PREPARE failed, the whole transfer fails:
        this.transfersSent[transferId].reject(err)
        setTimeout(() => { // not sure if this works for deleting the entry
          delete this.requestsSent[requestId]
        }, 0)
      }.bind(this)
    }
    // console.log('sending PREPARE')
    this.sendCall(ClpPacket.TYPE_PREPARE, requestId, {
      transferId,
      amount: transfer.amount,
      expiresAt: transfer.expiresAt,
      executionCondition: transfer.executionCondition,
      protocolData
    })
    // console.log('sent!')
    return new Promise((resolve, reject) => {
      this.transfersSent[transferId] = { resolve, reject, condition: transfer.executionCondition, amount: transfer.amount }
    })
  },

  handleProtocolRequest (protocolName, packet, transfer) {
    if (this.protocolHandlers[protocolName]) {
      return this.protocolHandlers[protocolName](packet, transfer).catch(err => {
        throw this.makeLedgerError(err.message)
      })
    } else {
      return Promise.reject(this.makeLedgerError('first protocol unsupported'))
    }
  }
}

module.exports = Clp

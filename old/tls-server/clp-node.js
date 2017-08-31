const ClpPacket = require('clp-packet')
const uuid = require('uuid/v4')

function ClpNode(socket) {
  this.socket = socket
  this.pendingTrans = {} // Fulfill and Reject will look here
  this.pendingReq = {} // Ack, Response, and Error will look here
  this.protocolHandlers = {}
  this.buf = new Buffer('')
  this.cursor = 0
  this.lengthWanted = Infinity
  this.chunkPromise = function() {}
}

ClpNode.prototype = {
  genRequestId() {
    return uuid()
  },

  talk() {
    this.socket.on('data', chunk => {
      this.buf.concat(chunk)
      if (this.buf.length >= this.lengthWanted) {
        this.lengthWanted = Infinity
        this.chunkPromise()
      }
    })
    this.handleClpPackets()
  },
  
  waitForBufferLength(len) {
    if (this.buf.length >= len) {
      return Promise.resolve()
    }
    return new Promise(resolve => {
      this.lengthWanted = len
      this.chunkPromise = resolve
    })
  },

  read(numBytes) {
    if (this.reading) {
      throw new Error('already reading!')
    }
    this.reading = true
    const oldCursor = this.cursor
    this.cursor += numBytes
    return this.waitForBufferLength(this.cursor).then(() => {
      const ret = this.buf.slice(oldCursor, this.cursor)
      this.cursor = newCursor
      this.reading = false
      return ret
    })
  },

  async handleResponse(callType, requestId, socket) {
    if (typeof pendingReq[requestId] !== 'object') {
      // response is not for us
      return
    }
    switch(callType) {
    case CALL_ERROR:
      return this.pendingReq[requestId].reject(await this.readErrorPacket())
    case CALL_RESPONSE:
      let responses = await this.readProtocolData()
      return this.pendingReq[requestId].resolve(responses[0].data)
    case CALL_ACK:
      return this.pendingReq[requestId].resolve()
    }
  },
  
  async handleProtocolRequests(socket, transferData) {
    let requests = await readProtocolData(socket)
    let mainRequest = requests.shift()
    requests.map(request => {
      try {
        protocolHandlers[request.protocolName](request.data, transferData)
      } catch(e) {
        // ignore side protocol errors
      }
    })
    try {
      return protocolHandlers[mainRequest.protocolName](mainRequest.data, transferData)
    } catch(e) {
      return Promise.reject('could not handle main request')
    }
    return mainPromise.then(result => {
      return makeProtocolData(mainRequest.protocolName, 0, result)
    }, ilpError => {
      throw {
        error: ilpError,
        response: MakeSequence(results)
      }
    }).then(mainResult => {
      results.unshift(mainResult)
      return {
        error: null,
        response: MakeSequence(results)
      }
    })
  },
  
  readLocalTransfer(socket) {
    const transferId = this.read(16)
    const amount = this.read(8)
    const executionCondition =this.read(32)
    const expiresAt = this.read(TimestampLength)
    return {
      transferId,
      amount,
      executionCondition,
      expiresAt
    }
  },
  
  async handleClpPackets() {
    // read https://github.com/interledger/rfcs/blob/mj-common-ledger-protocol/asn1/CommonLedgerProtocol.asn#L107
    const callType = await this.read(1)
    console.log(callType)
    // read https://github.com/interledger/rfcs/blob/mj-common-ledger-protocol/asn1/CommonLedgerProtocol.asn#L109
    const requestId = await this.read(4)
    if (callType == CALL_ACK || callType == CALL_RESPONSE || callType == CALL_ERROR) {
      handleResponse(callType, requestId, socket)
    } else if (callType == CALL_MESSAGE) {
      handleProtocolRequests(socket).then(results => {
        this.socket.write(CALL_RESPONSE)
        this.socket.write(requestId)
        this.writeProtocolData(results)
      }, error => {
        this.socket.write(CALL_ERROR)
        this.socket.write(requestId)
        this.socket.write(error)
        this.writeProtocolData({})
      })
    } else if (callType == CALL_PREPARE) {
      const transferData = readLocalTransfer(socket)
      handleProtocolRequests(socket, transferData).then(results => {
        this.socket.write(CALL_FULFILL)
        this.socket.write(this.genRequestId())
        this.socket.write(transferId)
        this.writeProtocolData(results)
      }, error => {
        this.socket.write(CALL_REJECT)
        this.socket.write(genRequestId())
        this.socket.write(transferId)
        this.socket.wirte(error)
        this.writeProtocolData({})
      })
      this.socket.write(CALL_ACK)
      this.socket.write(requestId)
      this.writeProtocolData({})
    }
  },
  
  unpaid(protocolDataObj) {
    const requestId = this.genRequestId()
    this.socket.write(CALL_MESSAGE)
    this.socket.write(requestId)
    this.socket.writeProtocolData(protocolDataObj)
    return new Promise((resolve, reject) => {
      this.pendingReq[requestId] = { resolve, reject }
    })
  },
  
  conditional(transfer, protocolDataObj) {
    const requestId = this.genRequestId()
    this.socket.write(CALL_PREPARE)
    this.socket.write(requestId)
    this.writeTransfer(transfer)
    this.socket.write(transfer.transferId)
    this.socket.write(transfer.amount)
    this.socket.write(transfer.executionCondition)
    this.socket.write(transfer.expiresAt)
    this.socket.writeProtocolData(protocolDataObj)
    this.pendingReq[requestId] = {
      resolve() {
        // ignore ack
      },
      reject(err) {
        // if prepare already results in ERROR, that's like
        // REJECT
        this.pendingTrans[transfer.transferId].reject(err)
      }
    }
    return new Promise((resolve, reject) => {
      this.pendingTrans[transfer.transferId] = { resolve, reject }
    })
  },

  setProtocolHandler(protocolName, handler) {
    this.handler[protocolName] = handler
  }
}

module.exports = ClpNode

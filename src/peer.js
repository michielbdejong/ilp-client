const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')

const Clp = require('./clp')

function lengthPrefixFor (buf) {
  if (buf.length < 128) {
    return Buffer.from([buf.length])
  } else {
    // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
    const lenLen = 128 + 2
    const lenLo = buf.length % 256
    const lenHi = (buf.length - lenLo) / 256
    return Buffer.from([lenLen, lenHi, lenLo])
  }
}

const BalancePacket = {
  serializeResponse (num) {
    let prefix = '0208' + '0000' + '0000' + '0000' + '0000'
    let suffix = num.toString(16)
    return Buffer.from(prefix.substring(0, prefix.length - suffix.length) + suffix, 'hex')
  }
}
const InfoPacket = {
  serializeResponse (info) {
    const infoBuf = Buffer.from(info, 'ascii')
    return Buffer.concat([
      Buffer.from([2]),
      lengthPrefixFor(infoBuf),
      infoBuf
    ])
  }
}

const CcpPacket = {
  TYPE_ROUTES: 0,
  TYPE_REQUEST_FULL_TABLE: 1,

  serialize (obj) {
    if (obj.type === 0) {
      const dataBuf = JSON.stringify(obj.data)
      return Buffer.concat([
        Buffer.from([0]),
        lengthPrefixFor(dataBuf),
        dataBuf
      ])
    } else if (obj.type === 1) {
      return Buffer.from([1])
    }
    throw new Error('unknown packet type')
  },

  deserialize (dataBuf) {
    let lenLen = 1
    if (dataBuf[0] >= 128) {
      // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
      lenLen = 1 + (dataBuf[0] - 128)
    }
    let obj
    try {
      obj = JSON.parse(dataBuf.slice(lenLen).toString('ascii'))
    } catch (e) {
    }
    return obj
  }
}

const VouchPacket = {
  deserialize (dataBuf) {
    let lenLen = 1
    let addressLen = dataBuf[1]
    if (dataBuf[1] >= 128) {
      // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
      lenLen = 1 + (dataBuf[0] - 128)
      // TODO: write unit tests for this code and see if we can use it to
      // read the address, condition, and amount of a rollback
      addressLen = 0
      let cursor = 2
      switch (lenLen) {
        case 7: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
        case 6: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
        case 5: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
        case 4: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
        case 3: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
        case 2: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
        case 1: addressLen = addressLen * 256 + dataBuf[cursor++] // eslint-disable-line no-fallthrough
      }
    }
    // console.log(dataBuf, lenLen, dataBuf.slice(lenLen))
    return {
      callId: dataBuf[0], // 1: 'vouch for', 2: 'reach me at', 3: 'roll back'
      address: dataBuf.slice(1 + lenLen, addressLen).toString('ascii')
      // TODO: report condition and amount in case callId is 'roll back', and
      // stop them from being concatenated as bytes at the end of the address.
    }
  }
}

function Peer (baseLedger, peerName, initialBalance, ws, quoter, forwarder, fulfiller, voucher) {
  this.baseLedger = baseLedger
  this.peerName = peerName
  this.quoter = quoter
  this.forwarder = forwarder
  this.fulfiller = fulfiller
  this.voucher = voucher

  this.clp = new Clp(initialBalance, ws, {
    ilp: this.handleIlp.bind(this),
    vouch: this.handleVouch.bind(this),
    ccp: this.handleCcp.bind(this),
    info: this.handleInfo.bind(this),
    balance: this.handleBalance.bind(this)
  })
}

Peer.prototype = {
  handleIlp (dataBuf, transfer) {
    if (transfer) {
      if (this.fulfiller) {
        // console.log('trying the fulfiller!')
        const fulfillment = this.fulfiller(transfer.executionCondition)
        if (fulfillment) {
          return Promise.resolve(fulfillment)
        }
        // console.log(fulfillment)
      }
      // console.log('forwarding payment', obj)
      return this.forwarder.forward(transfer, dataBuf)
    }
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
  },

  handleInfo (dataBuf) {
    if (dataBuf[0] === 0) {
      // console.log('info!', dataBuf)
      return Promise.resolve(InfoPacket.serializeResponse(this.baseLedger + this.peerName))
    }
    return Promise.reject(this.makeLedgerError('unknown call id'))
  },

  handleBalance (dataBuf) {
    if (dataBuf[0] === 0) {
      // console.log('balance!', dataBuf)
      return Promise.resolve(BalancePacket.serializeResponse(this.clp.balance))
    }
    return Promise.reject(this.makeLedgerError('unknown call id'))
  },

  handleCcp (dataBuf) {
    const obj = CcpPacket.deserialize(dataBuf)
    switch (obj.type) {
      case CcpPacket.TYPE_ROUTES:
        // console.log('received route broadcast!', obj)
        for (let route of obj.new_routes) {
          if (this.quoter.setCurve(route.destination_ledger, Buffer.from(route.points, 'base64'), 'peer_' + this.peerName)) {
            // route is new to us
            this.forwarder.forwardRoute(route)
          }
        }
        return Promise.resolve() // ack
      case CcpPacket.TYPE_REQUEST_FULL_TABLE:
        return CcpPacket.serialize({
          type: CcpPacket.TYPE_ROUTES,
          data: {
            new_routes: this.quoter.getRoutesArray(this.peerName),
            unreachable_through_me: []
          }
        })
    }
    return Promise.reject(this.makeLedgerError('unknown call id'))
  },

  handleVouch (dataBuf) {
    const obj = VouchPacket.deserialize(dataBuf)
    // console.log('received vouch!', obj)
    return this.voucher(obj.address)
  },

  interledgerPayment (transfer, payment) {
    return this.clp.conditional(transfer, [
      {
        protocolName: 'ilp',
        contentType: ClpPacket.MIME_APPLICATION_OCTET_STREAM,
        data: payment
      }
    ])
  },

  announceRoutes (routes) {
    return this.clp.unpaid('ccp', CcpPacket.serialize({
      type: CcpPacket.TYPE_ROUTES,
      data: {
        new_routes: routes,
        unreachable_through_me: []
      }
    }))
  }
}

module.exports = Peer

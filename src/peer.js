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
  TYPE_REQUEST: 1,
  TYPE_RESPONSE: 2,

  serializeResponse (info) {
    console.log('serializing!', info)
    const infoBuf = Buffer.from(info, 'ascii')
    return Buffer.concat([
      Buffer.from([this.TYPE_RESPONSE]),
      lengthPrefixFor(infoBuf),
      infoBuf
    ])
  },

  deserialize (dataBuf) {
    let obj = {
      type: dataBuf[0]
    }
    if (dataBuf[0] === this.TYPE_RESPONSE) {
      let lenLen = 1
      if (dataBuf[1] >= 128) {
        // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
        lenLen = 1 + (dataBuf[1] - 128)
      }
      try {
        console.log(dataBuf.toString('hex'), dataBuf.slice(lenLen + 1).toString('ascii'))
        obj.address = dataBuf.slice(lenLen + 1).toString('ascii')
      } catch (e) {
      }
    }
    return obj
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
    let obj = {
      type: dataBuf[0]
    }
    if (dataBuf[0] === this.TYPE_ROUTE) {
      let lenLen = 1
      if (dataBuf[1] >= 128) {
        // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
        lenLen = 1 + (dataBuf[1] - 128)
      }
      try {
        obj.data = JSON.parse(dataBuf.slice(lenLen + 1).toString('ascii'))
      } catch (e) {
      }
    }
    return obj
  }
}

const VouchPacket = {
  TYPE_VOUCH: 1,
  TYPE_REACHME: 2,
  TYPE_ROLLBACK: 3,

  serialize (obj) {
    // TODO: Implement TYPE_ROLLBACK
    console.log('serializing!', obj)
    const addressBuf = Buffer.from(obj.address, 'ascii')
    return Buffer.concat([
      Buffer.from([obj.type]),
      lengthPrefixFor(addressBuf),
      addressBuf
    ])
  },

  deserialize (dataBuf) {
    let lenLen = 1
    let addressLen = dataBuf[1]
    if (dataBuf[1] >= 128) {
      // See section 8.6.5 of http://www.itu.int/rec/T-REC-X.696-201508-I
      lenLen = 1 + (dataBuf[1] - 128)
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
      address: dataBuf.slice(1 + lenLen, 1 + lenLen + addressLen).toString('ascii')
      // TODO: report condition and amount in case callId is 'roll back', and
      // stop them from being concatenated as bytes at the end of the address.
    }
  }
}

function Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
  this.baseLedger = baseLedger
  this.peerName = peerName
  this.quoter = quoter
  this.transferHandler = transferHandler
  this.routeHandler = routeHandler
  this.voucher = voucher
  console.log('Peer instantiates Clp', baseLedger, initialBalance)
  this.clp = new Clp(baseLedger, initialBalance, ws, {
    ilp: this._handleIlp.bind(this),
    vouch: this._handleVouch.bind(this),
    ccp: this._handleCcp.bind(this),
    info: this._handleInfo.bind(this),
    balance: this._handleBalance.bind(this)
  })
}

Peer.prototype = {
  _handleIlp (dataBuf, transfer) {
    if (transfer) {
      return this.transferHandler(transfer, dataBuf)
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

  _handleInfo (dataBuf) {
    if (dataBuf[0] === 0) {
      console.log('info!', dataBuf)
      return Promise.resolve(InfoPacket.serializeResponse(this.baseLedger.substring(0, this.baseLedger.length - 1)))
    }
    return Promise.reject(this.makeLedgerError('unknown call id'))
  },

  _handleBalance (dataBuf) {
    if (dataBuf[0] === 0) {
      // console.log('balance!', dataBuf)
      return Promise.resolve(BalancePacket.serializeResponse(this.clp.balance))
    }
    return Promise.reject(this.makeLedgerError('unknown call id'))
  },

  _handleCcp (dataBuf) {
    const obj = CcpPacket.deserialize(dataBuf)
    switch (obj.type) {
      case CcpPacket.TYPE_ROUTES:
        // console.log('received route broadcast!', obj)
        for (let route of obj.new_routes) {
          if (this.quoter.setCurve(route.destination_ledger, Buffer.from(route.points, 'base64'), 'peer_' + this.peerName)) {
            // route is new to us
            this.routeHandler(route)
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

  _handleVouch (dataBuf) {
    const obj = VouchPacket.deserialize(dataBuf)
    // console.log('received vouch!', obj)
    return this.voucher(obj.address)
  },

  interledgerPayment (transfer, payment) {
    console.log('sending ILP payment on CLP transfer')
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
  },

  getMyIlpAddress() {
    return this.clp.unpaid('info', Buffer.from([ 0 ])).then(responseMainProtocolData => {
      return InfoPacket.deserialize(responseMainProtocolData.data).address
    })
  },
  vouchBothWays(address) {
    const packet1 = VouchPacket.serialize({ type: VouchPacket.TYPE_VOUCH, address })
    const packet2 = VouchPacket.serialize({ type: VouchPacket.TYPE_REACHME, address })
    return Promise.all([this.clp.unpaid('vouch', packet1), this.clp.unpaid('vouch', packet2) ])
  }
}

module.exports = Peer

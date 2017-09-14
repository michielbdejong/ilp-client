const ClpPacket = require('clp-packet')
const IlpPacket = require('ilp-packet')

const Clp = require('./clp')
const { InfoPacket, BalancePacket, CcpPacket, VouchPacket, PaychanPacket } = require('./protocols')

function Peer (baseLedger, peerName, initialBalance, ws, quoter, transferHandler, routeHandler, voucher) {
  this.baseLedger = baseLedger
  this.peerName = peerName
  this.quoter = quoter
  this.transferHandler = transferHandler
  this.routeHandler = routeHandler
  this.voucher = voucher
  // console.log('Peer instantiates Clp', baseLedger, initialBalance)
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
      // console.log('info!', dataBuf, this.baseLedger, this.peerName)
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
    return this.voucher(obj.callId, obj.address)
  },

  interledgerPayment (transfer, payment) {
    // console.log('sending ILP payment on CLP transfer')
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

  getMyIlpAddress () {
    // console.log('getting my ilp address')
    return this.clp.unpaid('info', Buffer.from([ 0 ])).then(responseMainProtocolData => {
      // console.log('got my ilp address', responseMainProtocolData)
      // console.log(InfoPacket.deserialize(responseMainProtocolData.data))
      return InfoPacket.deserialize(responseMainProtocolData.data).address
    })
  },
  vouchBothWays (address) {
    const packet1 = VouchPacket.serialize({ callId: VouchPacket.TYPE_VOUCH, address })
    const packet2 = VouchPacket.serialize({ callId: VouchPacket.TYPE_REACHME, address })
    // console.log('sending vouches', packet1, packet2)
    return Promise.all([this.clp.unpaid('vouch', packet1), this.clp.unpaid('vouch', packet2)])
  }
}

module.exports = Peer

const IlpPacket = require('ilp-packet')

const MIN_MESSAGE_WINDOW = 10000 // make sure you always have 10 seconds to fulfill after your peer fulfilled. Never set this to less than 1 second, especially not during a leap second
const FORWARD_TIMEOUT = MIN_MESSAGE_WINDOW + 1000 // don't bother the next node with requests that have less than one second left on the clock

const ERROR_LACK_TIME = 1
const ERROR_LACK_SOURCE_AMOUNT = 2
const ERROR_NO_ROUTE = 3

function Forwarder (quoter, peers) {
  this.quoter = quoter
  this.peers = peers
}

Forwarder.prototype = {
  forward (transfer, paymentPacket) {
    const payment = IlpPacket.deserializeIlpPayment(paymentPacket)
    if (transfer.expiresAt.getTime() < new Date().getTime() + FORWARD_TIMEOUT) {
      return Promise.reject(ERROR_LACK_TIME)
    }
    // console.log('finding quote', payment)
    const { onwardAmount, onwardPeer } = this.quoter.findHop(payment.account, parseInt(payment.amount))
    // console.log('quote', onwardAmount, onwardPeer)
    if (!onwardPeer || !this.peers[onwardPeer]) {
      return Promise.reject(ERROR_NO_ROUTE)
    }
    if (onwardAmount > transfer.amount) {
      // console.log('lack source amount', onwardAmount / 1000, transfer.amount / 1000)
      return Promise.reject(ERROR_LACK_SOURCE_AMOUNT)
    }
    // console.log('calling')
    return this.peers[onwardPeer].interledgerPayment({
      amount: onwardAmount,
      expiresAt: new Date(transfer.expiresAt.getTime() - MIN_MESSAGE_WINDOW),
      executionCondition: transfer.executionCondition
    }, paymentPacket)
  },

  forwardRoute (route) {
    for (let name in this.peers) {
      if (name.startsWith('peer_')) { // only forward over CLP peers, not virtual peers (ledger plugins)
        this.peers[name].announceRoute(route)
      }
    }
  }
}

module.exports = Forwarder

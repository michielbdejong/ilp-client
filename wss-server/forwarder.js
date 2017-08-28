const MIN_MESSAGE_WINDOW = 10000 // make sure you always have 10 seconds to fulfill after your peer fulfilled
const FORWARD_TIMEOUT = MIN_MESSAGE_WINDOW + 1000 // don't bother the next node with requests that have less than one second left on the clock

const ERROR_LACK_TIME = 1
const ERROR_LACK_SOURCE_AMOUNT = 2
const ERROR_NO_ROUTE = 3

function Forwarder(quoter, peers) {
  this.quoter = quoter
  this.peers = peers
}

Forwarder.prototype = {
  forward(transfer, payment) {
    if (transfer.expiresAt.getTime() < new Date().getTime() + FORWARD_TIMEOUT) {
      return Promise.reject(ERROR_LACK_TIME)
    }
    const { onwardAmount, onwardPeer } = this.quoter.findHop(payment.address, parseInt(payment.amount))
    if (!onwardPeer || !this.peers[onwardPeer]) {
      return Promise.reject(ERROR_NO_ROUTE)
    }
    if (onwardAmount > transfer.amount) {
      return Promise.reject(ERROR_LACK_SOURCE_AMOUNT)
    }
    return this.peers[onwardPeer].interledgerPayment({
      amount: onwardAmount,
      expiresAt: new Date(transfer.expiresAt.getTime() - MIN_MESSAGE_WINDOW),
      executionCondition: transfer.executionCondition,
      payment
    })
  }
}         

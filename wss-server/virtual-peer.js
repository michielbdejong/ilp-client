const IlpPacket = require('ilp-packet')
const uuid = require('uuid/v4')

function VirtualPeer(plugin, forwarder) {
  this.plugin = plugin
  this.forwarder = forwarder
  this.transfersSent = {}
  this.vouches = {}
  this.plugin.on('incoming_prepare', this.handleTransfer.bind(this))
  this.plugin.on('outgoing_fulfill', this.handleFulfill.bind(this))
  this.plugin.on('outgoing_reject', this.handleReject.bind(this))
}

VirtualPeer.prototype = {
  checkVouch(fromAddress, amount) {
    if (!this.vouches[fromAddress]) {
      return false
    }
    return this.vouches[fromAddress] > amount
  },

  setVouch(address, max) {
    this.vouches[address] = max
  },

  handleTransfer(transfer) {
    // Technically, this is checking the vouch for the wrong
    // amount, but if the vouch checks out for the source amount,
    // then it's also good enough to cover onwardAmount
    if (this.checkVouch(transfer.from, parseInt(transfer.amount))) {
      this.forwarder.forward({
       expiresAt: new Date(transfer.expiresAt),
       amount: parseInt(transfer.amount),
       executionCondition: Buffer.from(transfer.executionCondition, 'base64')
      }, Buffer.from(transfer.ilp, 'base64')).then((fulfillment) => {
        this.plugin.fulfillCondition(transfer.id, fulfillment.toString('base64'))
      }, (err) => {
        this.plugin.rejectIncomingTransfer(transfer.id, IlpPacket.deserializeIlpError(err))
      })
    } else {
      this.plugin.rejectIncomingTransfer(transfer.id, {
        code: 'L53',
        name: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
        message: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
        triggered_by: plugin.getAccount(),
        forwarded_by: [],
        triggered_at: new Date().getTime(),
        additional_info: {}
      })
    }
  },

  interledgerPayment(transfer, payment) {
    const paymentObj = IlpPacket.deserializeIlpPayment(payment)
    const transferId = uuid()
    const promise = new Promise((resolve, reject) => {
      this.transfersSent[transferId] = { resolve, reject }
    })
    plugin.sendTransfer({
      id: transferId,
      from: plugin.getAccount(),
      to: paymentObj.account,
      ledger: plugin.getInfo().prefix,
      amount: paymentObj.amount,
      ilp: payment,
      noteToSelf: {},
      custom: {}
    }).catch(err => {
      this.transfersSent[transferId].reject(err)
    })
    return promise
  },

  handleFulfill(transfer, fulfillment) {
    this.transfersSent[transfer.id].resolve(Buffer.from(fulfillment, 'base64'))
  },

  handleReject(transfer, rejectionMessage) {
    this.transfersSent[transfer.id].reject(rejectionReason)
  }
}

module.exports = VirtualPeer

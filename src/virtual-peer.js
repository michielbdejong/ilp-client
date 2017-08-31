const IlpPacket = require('ilp-packet')
const uuid = require('uuid/v4')

function VirtualPeer(plugin, forwarder, checkVouch) {
  this.plugin = plugin
  this.forwarder = forwarder
  this.checkVouch = checkVouch
  this.transfersSent = {}
  this.plugin.on('incoming_prepare', this.handleTransfer.bind(this))
  this.plugin.on('outgoing_fulfill', this.handleFulfill.bind(this))
  this.plugin.on('outgoing_reject', this.handleReject.bind(this))
}

VirtualPeer.prototype = {

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
        triggered_by: this.plugin.getAccount(),
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
    this.plugin.sendTransfer({
      id: transferId,
      from: this.plugin.getAccount(),
      to: paymentObj.account,
      ledger: this.plugin.getInfo().prefix,
      amount: paymentObj.amount,
      ilp: payment,
      noteToSelf: {},
      executionCondition: transfer.executionCondition.toString('base64'),
      expiresAt: transfer.expiresAt,
      custom: {}
    }).catch(err => {
      this.transfersSent[transferId].reject(err)
    })
    return promise
  },

  handleFulfill(transfer, fulfillmentBase64) {
    this.transfersSent[transfer.id].resolve(Buffer.from(fulfillmentBase64, 'base64'))
  },

  handleReject(transfer, rejectionReasonBase64) {
    this.transfersSent[transfer.id].reject(Buffer.from(rejectionReasonBase64, 'base64'))
  }
}

module.exports = VirtualPeer

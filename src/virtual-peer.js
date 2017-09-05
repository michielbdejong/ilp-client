const IlpPacket = require('ilp-packet')
const uuid = require('uuid/v4')

function VirtualPeer (escrowPlugin, paychanPlugin, forwardCb, checkVouchCb, connectorAddress) {
  this.escrowPlugin = escrowPlugin
  this.paychanPlugin = paychanPlugin
  this.forwardCb = forwardCb
  this.checkVouchCb = checkVouchCb
  this.connectorAddress = connectorAddress
  this.transfersSent = {}
  this.escrowPlugin.on('incoming_prepare', this.handleTransfer.bind(this))
  this.escrowPlugin.on('outgoing_fulfill', this.handleFulfill.bind(this))
  this.escrowPlugin.on('outgoing_reject', this.handleReject.bind(this))
}

VirtualPeer.prototype = {
  createPayChan(from, to, amount) {
    return new this.PaychanPlugin({
      _api = opts.api
      _address = opts.address
      _secret = opts.secret
      _amount = opts.amount
      _fundPercent = new BigNumber('0.8')
      _destination = opts.destination
    this._store = opts.store
    this._keyPair = nacl.sign.keyPair.fromSeed(util.sha256(opts.channelSecret))
    this._balance = new Balance({
      //     123456789
      name: 'balance_o',
      maximum: this._amount,
      store: this._store
    })
  }
  handleTransfer (transfer) {
    // console.log('handleTransfer!', Buffer.from(transfer.executionCondition, 'base64'))
    // Technically, this is checking the vouch for the wrong
    // amount, but if the vouch checks out for the source amount,
    // then it's also good enough to cover onwardAmount
    if (this.checkVouchCb(transfer.from, parseInt(transfer.amount))) {
      // console.log('vouch check ok, forwarding!!')
      const promise = Promise.resolve(this.forwardCb({
        expiresAt: new Date(transfer.expiresAt),
        amount: parseInt(transfer.amount),
        executionCondition: Buffer.from(transfer.executionCondition, 'base64')
      }, Buffer.from(transfer.ilp, 'base64')))
      // console.log('forwarded, promise', promise)
      promise.then((fulfillment) => {
        // console.log('submitting fulfillment to ledger!', transfer.executionCondition, fulfillment)
        const fulfilled = this.escrowPlugin.fulfillCondition(transfer.id, fulfillment.toString('base64'))
        // console.log('fulfilled, promise', fulfilled)
        fulfilled.then(() =>{
          // console.log('submitted that fulfillment to ledger!', transfer.executionCondition, fulfillment)
        }, err => {
          console.log('failed to submit that fulfillment to ledger!', transfer.executionCondition, fulfillment, err)
        })
      }, (err) => {
        console.log('could not forward, rejecting')
        this.escrowPlugin.rejectIncomingTransfer(transfer.id, IlpPacket.deserializeIlpError(err))
      })
    } else {
      console.log('vouch check not ok, rejecting!')
      this.escrowPlugin.rejectIncomingTransfer(transfer.id, {
        code: 'L53',
        name: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
        message: 'transfer was sent from a wallet that was not vouched for (sufficiently)',
        triggered_by: this.escrowPlugin.getAccount(),
        forwarded_by: [],
        triggered_at: new Date().getTime(),
        additional_info: {}
      })
    }
  },

  interledgerPayment (transfer, payment) {
    // console.log('sending ILP payment on on-ledger transfer')
    const paymentObj = IlpPacket.deserializeIlpPayment(payment)
    const transferId = uuid()
    const promise = new Promise((resolve, reject) => {
      this.transfersSent[transferId] = {
        resolve(result) {
          // console.log('transfer result in VirtualPeer', result)
          resolve(result)
        },
        reject(err) {
          // console.log('transfer err  in VirtualPeer', err, typeof err, Buffer.isBuffer(err))
          // console.log('calling reject', reject)
          reject(err)
        }
      }
    })
    const lpiTransfer = {
      id: transferId,
      from: this.escrowPlugin.getAccount(),
      to: this.connectorAddress,
      ledger: this.escrowPlugin.getInfo().prefix,
      amount: paymentObj.amount,
      ilp: payment.toString('base64'),
      noteToSelf: {},
      executionCondition: transfer.executionCondition.toString('base64'),
      expiresAt: transfer.expiresAt,//.toISOString(),
      custom: {}
    }
    if (paymentObj.account.startsWith(lpiTransfer.ledger)) {
      // console.log('last hop, to receiver instead of to connector')
      lpiTransfer.to = paymentObj.account
    }
    // console.log('VirtualPeer calls sendTransfer!', lpiTransfer)

    this.escrowPlugin.sendTransfer(lpiTransfer).catch(err => {
      console.log('sendTransfer failed', err)
      this.transfersSent[transferId].reject({
        code: 'L62',
        name: err.message
      })
      delete this.transfersSent[transfer.id]
    })
    return promise
  },

  handleFulfill (transfer, fulfillmentBase64) {
    // console.log('handling fulfill!', Buffer.from(transfer.executionCondition, 'base64'), Buffer.from(fulfillmentBase64, 'base64'))
    this.transfersSent[transfer.id].resolve(Buffer.from(fulfillmentBase64, 'base64'))
    delete this.transfersSent[transfer.id]
  },

  handleReject (transfer, rejectionReasonBase64) {
    console.log('handling reject!', Buffer.from(transfer.executionCondition, 'base64'), Buffer.from(rejectionReasonBase64, 'base64'))
    this.transfersSent[transfer.id].reject(Buffer.from(rejectionReasonBase64, 'base64'))
    delete this.transfersSent[transfer.id]
  }
}

module.exports = VirtualPeer

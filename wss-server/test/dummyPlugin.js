function DummyPlugin(config) {
  this.handlers = {}
  this.transfers = []
  this.prefix = config.prefix
}

DummyPlugin.prototype = {
  on(eventName, callback) {
    this.handlers[eventName] = callback
  },
  sendTransfer(transfer) {
    this.transfers.push(transfer)
    setTimeout(() => {
      console.log('dummy plugin fulfills!', transfer, this.fulfillment)
      this.handlers.outgoing_fulfill(transfer, this.fulfillment.toString('base64'))
    }, 0)
    return Promise.resolve(null)
  },
  connect() {},
  getAccount() { return this.prefix + 'dummy-account' },
  getInfo() { return { prefix: this.prefix } }
}

module.exports = DummyPlugin

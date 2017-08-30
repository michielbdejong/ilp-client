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
      this.handlers.outgoing_fulfill(transfer, Buffer.from('1234*fulfillment1234*fulfillment', 'ascii'))
    }, 0)
  },
  connect() {},
  getAccount() { return 'dummy-ledger.dummy-account' },
  getInfo() { return { prefix: this.prefix } }
}

module.exports = DummyPlugin

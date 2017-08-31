module.exports = function(threadId) {
  this.threadId = threadId
  this.redis = { // fake
    _kv: {},
    get(k) { return Promise.resolve(this._kv[k]) },
    set(k, v) { this._kv[k] = v; return Promise.resolve() },
    incr(k, amount) { this._kv[k] += amount; return Promise.resolve() },
    decr(k, amount) { this._kv[k] -= amount; return Promise.resolve() }
  }
  this.balanceBeingUpdated = Promise.resolve()
}
// forward to user, peer, or frog
// in all cases use LLL (user can listen on localtunnel, frog used for all external plugins
// -> but LLL doesn't support different paychans, what if a peer wants to peer over a ledger?
//    -> multi-hop messaging is not supported, but multi-hop payments are. so if a peer wants
//       to be "behind" a ledger, they can receive frog-forwarded paid/conditional messages,
//       and the frog will charge a small commission.
//    -> you can send paychan updates in SideChannelData, to "pay" / adjust the trustline's balance
//    -> same for unconditional deposit receipts
//    -> you can also send a paid message to a frog to fund a remote trustline.
// -> Interledger RPC over seven ledgers is not impressive, you need to chain the hashlocks.
//    -> bells-and-whistles channels?
//    -> on-ledger escrow with/without side-comms?
//    -> we need entry/exit on each crypto-ledger
//    -> but do we also need to be able to use them as peer ledgers? Comms over a blockchain is just silly.
//    -> compromise: use side-comms for quoting, but do actual payment without?
//    -> that's still a bit silly - if you have the comms channel, it's better to use it to notify the connector asap, and *attach* the txid for sync-rolling an on-ledger transaction
//    -> for quote-less payments, and especially for delivery to receiver, it's ok to do on-ledger only.
//    -> also, it's still not trivial to do sync-rolling on-ledger, nor to do sync-rolling paychan
//    -> the only thing that's 'cheating' a bit is just having our own p2p transfer protocol, and add lots of settlement methods.
//    -> it's also a bit like we're now defining 'interledger-native', so maybe it's better to make sync-rolling the protocol default. 
module.exports.prototype = {
  checkRoutingTable(finalAddress, finalAmount) {
    const addressParts = finalAddress.split('.')
    const account = addressParts.pop()
    let nextHop
    do {
      nextHop = this.redis.get(addressParts.join('.') + '.')
      //for on-ledger, contains: ledger, fromId, amount, timeNeeded
      //for off-ledger, contains: toId, curve, timeNeeded
      addressParts.pop()
    } while(!nextHop)
    if (nextHop.ledger) {
      nextHop.toId = account
      nextHop.amount = finalAmount
    }
    nextHop.amount = sourceAmountFor(nextHop.curve, finalAmount)
    nextHop.expiresAt = new Date().getTime() + nextHop.timeNeeded
    return nextHop
  }

  handleIncomingPrepare(prepareRequest) {
    const { ledger, fromId, requestId, amount, executionCondition, expiresAt, packet } = prepareRequest
    if (!ledger) { // this request came in without an on-ledger transfer, so pay from the account's balance
      // balance check:
      if (this.hotBalance < amount) { // from here...
        return this.reject(accountId, requestId, 'account balance insufficient at current parallelism')
      }
      this.hotBalance -= amount
      // ... to here is executed synchronously, so if we reach here, this.hotBalance is still above zero
    }

    const ipp = IlpPacket.deserializeInterledgerProtocolPayment(packet)
    const excentric = this.checkRoutingTable(packet.address)
    // excentric contains: ledger?, fromId?, toId, amount, expiresAt

    // Interledger chaining 1: amount
    if (excentric.amount < amount) {
      this.reject(accountId, requestId, 'not enough source amount to reach that destination')
    }

    // Interledger chaining 2: time
    if (excentric.expiresAt < new Date().getTime()) {
      this.reject(accountId, requestId, 'not enough time to reach that destination')
    }

    // Interledger chaining 3: condition
    excentric.executionCondition = executionCondition

    // Interledger end-to-end:
    excentric.packet = packet

    // for on-ledger, this will make the concentric fulfill come back to this thread later:
    let promise = Promise.resolve()
    if (excentric.ledger) {
      this.setData('HotSet:' + excentric.ledger + ':' + excentric.fromId, this.threadId)
      this.pending[excentric.ledger + ':' + excentric.toId + ':' excentric.fromId] = prepareRequest
    }
    return promise.then(() => {
      excentric.requestId = uuid()
      return this.plugins[ledger].doExcentricPrepare(excentric, prepareRequest.fromId, prepareRequest.requestId)
    })
  }
  plugins: {
    null: {
      //doExcentricPrepare({ toId, requestId, amount, executionCondition, expiresAt, packet }) {
      doExcentricPrepare(prepareRequest, originalFromId, originalRequestId) {
        request(this.counterUrls[prepareRequest.toId], prepareRequest).then(finalization => {
          this.doExcentricFinalization(pending[null + ':' + finalization.fromId + ':' +          
}

// a node starts out isolated, but having (funded) wallets on various testnets
// for each wallet, a virtual peer is instantiated, but they can't do anything until you have a clp peer to vouch with
// it can start listening on a port, and obtain downstream clp peers that way
// it can also connect to upstream clp peers
// now it will vouch+announce for all its wallets
// it will automatically forward payments that were vouched for, and fulfill when it knows the fulfillment
// but how would you send? Connector should expose:
// * listPeers() => list of peerId's
// * createOutgoingPaychan(clpPeer, ledgerPeer, amount)
// * getPeer => peer object
//   * interledgerPayment(transfer, paymentPacket)
//   // for clp peers:
//   * getWallets()
//   * getQuote(quoteRequest)
//   * getInfo()
//   * getBalance()
//   * announceRoute()
//   * listPaychans()
//   * getPaychan()
//     * getBalance()
//     // for outgoing paychans:
//     * increaseClaim()
//     * revoke()
//     * fund() // only for XRP
//     // for incoming paychans:
//     * claim()


// To create a paychan:
// * get the wallet of the clp peer for the ledger. if you can't find it, fail.
// * have enough balance in your own wallet
// * create a paychan from your wallet to their wallet
// * add it to the clp peer.
function Paychan(ledgerPeer, clpPeer, initialAmount) {
}

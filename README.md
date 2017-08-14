# ilp-node
Testnet connector

# Software architecture
The Testnet Connector consists of a number of separate processes, each of which fulfills a different role. They are tied together by a redis database, with the following data structures:

coldBalance:accountId -> number

from first byte of accountId: parallelism (outgoing prepare/pay will fail if coldBalance + hotBalance[threadId] < parallelism * amount)
users could choose if they want to be on a farm with a higher or lower parallelism trade-off
sharding:
for concentric prepare/pay:
* off-ledger:
  * account's parallelism determines which http port they can connect to; there, the request is round-robined with the appropriate parallelism
  * handling thread becomes owner for all 4 steps (concentric prepare, excentric prepare, concentric fulfill, excentric fulfill)
* on-ledger:
  * no need to check balance, all threads listen, each running their own blockchain node where applicable,
  * duplicate forwarding, to the appropriate sharded processing thread, who then becomes the owner for all 4 steps (concentric prepare, excentric prepare, concentric fulfill, excentric fulfill)
  * actual processing strictly sharded by fulfillment to avoid double processing of external signal

concentric fulfill/reject:
* off-ledger: in request response from excentric prepare, so that automatically gets to the owner
* on-ledger: all threads see it and alert the owner

unitOfValue is 'ledgerBaseUnit'.

addressMapper: announcedRoute ->  { accountId: { LiquidityCurve, successes, failures } }
Question for routing group: If two accounts announce the same route, which account should be picked?
Maybe: with the highest balance wins most traffic (and their balance will become higher with successes!)
or: the lowest balance, for auto-balancing
or: based on successes/failures (but this can maybe be tricked)

connection model:
* user can specify RPC URL
* we publish client software that includes LocalTunnel
* no WebSockets, no TCP, just https
* Interledger RPC in JSON
* plugins used for on-ledger and paychan (on separate port) -> room for cleanup, probably

announce routing table once per minute

for routing back fulfillments from blockchains (and in case prepare-and-wait is not supported):
hotSet:excentricLedger:walletId:requestId -> ownerThread

quoteRequest: answer from addressMapper

idempotent operations:
* add an incoming or outgoing transferId to the hotSet of an accountId, set yourself as ownerThread
* look up the ownerThread of a condition, forward the fulfillment to that thread, so they can cancel their reject timer

atomic operation:
* move coldBalance into your own hotBalance and back

* balance = SUM( incomingFulfilled + incomingUnconditional - outgoingFulfilled - outgoingUnconditional - outgoingPrepared ),
* accept an outgoing prepare if balance > amount * parallelism
* atomically update an account's balance (atomic inc/dec operation, not get-then-set) when in/out unconditional, in fulfill, out prepare, out reject
* when outgoing prepare add yourself as the condition owner in the hotSet, and forward to a colleague thread based on IPP
* when incoming fulfill, forward the fulfillment to the owner
* at startup, check the hotset for old conditions that need to be marked as timedout


CLP:
transfer: {} or { amount } or { amount, expiresAt } or {
  amount,
  executionCondition,
  expiresAt
}
protocolData: buffer containing OER for:
[] or (will probably be rejected if transfer is conditional and packet contains packet ILQP module, or not conditional and packet contains InterledgerProtocolPayment) [ [ 1, InterledgerPacket ] ]
sendRequest(protocolDataBuffer, transfer) -> result
result is what came back with same requestId, or in fulfill or in reject
contains: ack / response / fulfillment / error + ProtocolData
setRequestHandler(function(protocolDataBuffer, transfer) -> result

supported protocols:
0: setup
0.1: authenticate (token, your account, account you want to talk to)
0.2: protocols { 1: 'InterledgerProtocol', 2: 'InterledgerProtocolPayment', 3: 'InterledgerQuotingProtocol', 4: 'reconcile', 5: 'getAvailableLiquidity' }
0.3: vouchFor (coin, network, wallet)

1: InterledgerPacket
1.1: InterledgerProtocolPayment
1.2: QuoteLiquidityRequest -> QuoteLiquidityResponse
1.4: QuoteBySourceAmountRequest -> QuoteBySourceAmountResponse
1.6: QuoteByDestinationAmountRequest -> QuoteByDestinationAmountResponse

2: InterledgerProtocolPayment
2.1: InterledgerProtocolPayment

3: ilqp
3.2: QuoteLiquidityRequest -> QuoteLiquidityResponse
3.4: QuoteBySourceAmountRequest -> QuoteBySourceAmountResponse
3.6: QuoteByDestinationAmountRequest -> QuoteByDestinationAmountResponse

4: reconcile
4.1: getAvailableLiquidity
4.2: reconcileSet
4.3: pleaseReconcile

5: getAvailableLiquidity
5.1: getAvailableLiquidity

1) for sending requests:
* choose whether to use Message or Prepare
* pick a requestId and remember it
* pick a transferId and remember it
* set timeout if specified
* wait for Ack/Response/Error with matching requestId or Fulfill/Reject or matching transferId
* if sending failed or nothing heard back before timeout, or response was malformed, or fulfillment was wrong, construct an error
* otherwise extract protocolData to return as octetStream
* return:
   * whether the result was a Error-occurred, Error-came-back, just Ack/Fulfill, or a real Response
   * the fulfillment in case it was a fulfill
   * the protocolData
* log the transfer and update the (hot-)balance

2) for the listener:
* if it's auto-reconcile, handle at 3)
* otherwise, call the handler with the transfer and the protocolData and wait for promise to resolve
* if it was conditional, send an Ack
* when promise resolves, if it was conditional, fulfill
* when promise resolves, if it unconditional, send Ack/Response with protocolData
* when promise rejects, if it was conditional, reject
* when promise rejects, if it unconditional, send Error with protocolData -> need a JavaScript error that carries an IlpError
* log the transfer and update the (hot-)balance

3) auto-reconcile:
* periodically send resolved ranges
* mark as resolved in transfer log
* reply with disputed sets
* act on pleaseReconcile request

Peering: connect over TLS

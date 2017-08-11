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


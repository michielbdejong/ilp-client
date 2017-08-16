const CALL_ACK = 1
const CALL_RESPONSE = 2
const CALL_ERROR = 3

const CALL_PREPARE = 4
const CALL_FULFILL = 5
const CALL_REJECT = 6
const CALL_MESSAGE = 7

let pendingTrans = {} // Fulfill and Reject will look here
let pendingReq = {} // Ack, Response, and Error will look here
let protocolHandlers = {}

function handleResponse(callType, requestId, readableStream) {
  if (typeof pendingReq[requestId] !== 'object') {
    // response is not for us
    return
  }
  let error = null
  if (callType === CALL_ERROR) {
    error = readErrorPacket(readableStream)
  }
  let responses = readProtocolData(readableStream)
  let mainResponse
  if (callType === CALL_RESPONSE && responses.length && responses[0].protocolName === pendingReq[requestId].protocolName) {
    mainResponse = responses.shift()
  }
  pendingReq[requestId].resolve({
    error,
    mainResponse,
    sideResponses: responses
  })
  
}

function handleProtocolRequests(readableStream, transferData) {
  let requests = readProtocolData(readableStream)
  let mainRequest = requests.shift()
  try {
    let mainPromise = protocolHandlers[mainRequest.protocolName](mainRequest.data, transferData)
  } catch(e) {
    return Promise.reject('could not handle main request')
  }
  let promises = []
  requests.map(request => {
    try {
      promises.push(protocolHandlers[request.protocolName](request.data, transferData).then(result => {
        return makeProtocolData(request.protocolName, 0, result)
        })
    } catch(e) {
      // ignore side protocol errors
    }
  })
  Promise.all(promises).catch(err => {
    return []
  }).then(results => {
    return mainPromise.then(result => {
      return makeProtocolData(mainRequest.protocolName, 0, result)
    }, ilpError => {
      throw {
        error: ilpError,
        response: MakeSequence(results)
      }
    }).then(mainResult => {
      results.unshift(mainResult)
      return {
        error: null,
        response: MakeSequence(results)
      }
    })
  })
}

function readLocalTransfer(readableStream) {
  const transferId = readableStream.read(16)
  const amount = readableStream.read(8)
  const executionCondition =readableStream.read(32)
  const expiresAt = readableStream.read(TimestampLength)
  return {
    transferId,
    amount,
    executionCondition,
    expiresAt
  }
}

function handleClpPacket(readableStream) {
  // read https://github.com/interledger/rfcs/blob/4e5282104c056e4df7cf120795a8fe7fba036864/asn1/CommonLedgerProtocol.asn#L96
  const callType = readableStream.read(1)
  const requestId = readableStream.read(4)
  if (callType == CALL_ACK || callType == CALL_RESPONSE || callType == CALL_ERROR) {
    handleResponse(callType, requestId, readableStream)
  } else if (callType == CALL_MESSAGE) {
    handleProtocolRequests(readableStream).then(successResult => {
      return concatenate(CALL_RESPONSE, requestId, successResult.resultsSequence)
    }, errorResult => {
      return concatenate(CALL_ERROR, requestId, erorResult.error, errorResult.resultsSequence)
    })
  } else if (callType == CALL_PREPARE) {
    const transferData = readLocalTransfer(readableStream)
    handleProtocolRequests(readableStream, transferData).then(successResult => {
      socket.write(concatenate(CALL_FULFILL, genRequestId(), transferId, successResult.resultsSequence))
    }, errorResult => {
      socket.write(concatenate(CALL_REJECT, genRequestId(), transferId, errorResult.error, errorResult.resultsSequence))
    })
    return concatenate(CALL_ACK, requestId, MakeSequence([])
  }
}

function talkClp(socket) {
  while (true) {
    handleClpPacket(socket).then(responsePacket => {
      console.log('handled clp packet')
      // we could stream the response, but that's probably tricky when
      // multiplexing responses to multiple requests, we don't want them
      // to get mixed up, so better to write the whole packet in one
      // blocking (synchronous) call:
      socket.write(responsePacket)
    })
  }
}

module.exports = {
  talkClp,
  unpaid,
  conditional,
  setProtocolHandler
}

// This is a simplification of https://github.com/interledgerjs/ilp-routing/blob/master/src/lib/prefix-map.js

function Quoter () {
  this.curves = {}
}

function findPoint (val, from, to, curveBuf) {
  let cursor = 0
  let prev = [0, 0]
  let next = [0, 0]
  while (next[from] < val) {
    if (cursor + 15 >= curveBuf.length) {
      throw new Error('amount lies past last curve point')
    }
    // 16 bytes define 2 UInt64's for one curve point:
    // x:  0  1  2  3      4  5  6  7
    // y:  8  9 10 11     12 13 14 15
    const readX = curveBuf[cursor + 7] + 256 * (curveBuf[cursor + 6] + (256 * curveBuf[cursor + 5] + (256 * curveBuf[cursor + 4])))
    const readY = curveBuf[cursor + 15] + 256 * (curveBuf[cursor + 14] + (256 * curveBuf[cursor + 13] + (256 * curveBuf[cursor + 12])))
    // console.log('read!', cursor, readX, readY)
    prev = next
    next = [ readX, readY ]
    // console.log('searching!', prev, next, from, to, val, cursor)
    cursor += 16
  }
  let perc = (val - prev[from]) / (next[from] - prev[from])
  return (prev[to] + perc * (next[to] - prev[to]))
}

function sourceToDest (x, curve) {
  return findPoint(x, 0, 1, curve)
}

function destToSource (y, curve) {
  return findPoint(y, 1, 0, curve)
}

Quoter.prototype = {
  setCurve (prefix, curveBuf, peer) {
    // for existing destinations:
    if (typeof this.curves[prefix] !== 'undefined') {
      // enforce same peer as existing curve:
      if (peer !== this.curves[prefix].peer) {
        return false
      }
      // if the curve is the same, there is nothing to update;
      if (curveBuf.compare(this.curves[prefix].buf) === 0) {
        // return false to avoid forwarding this update to others
        return false
      }
    }
    this.curves[prefix] = {
      buf: curveBuf,
      peer
    }
    return true
  },

  findCurve (address) {
    const parts = address.split('.')
    parts.pop()
    while (parts.length) {
      const prefix = parts.join('.') + '.'
      if (this.curves[prefix]) {
        return Object.assign(this.curves[prefix], {
          prefix
        })
      }
      parts.pop()
    }
    throw new Error('no curve found')
  },

  answerLiquidity (req) {
    const curve = this.findCurve(req.destinationAccount)
    // console.log(curve)
    return Promise.resolve({
      liquidityCurve: curve.buf,
      appliesToPrefix: curve.prefix,
      sourceHoldDuration: 15000,
      expiresAt: new Date(Date.now() + 3600 * 1000)
    })
  },

  answerBySource (req) {
    const curve = this.findCurve(req.destinationAccount)
    // console.log(curve)
    return Promise.resolve({
      destinationAmount: sourceToDest(parseInt(req.sourceAmount), curve.buf).toString(),
      sourceHoldDuration: 3000
    })
  },

  answerByDest (req) {
    const curve = this.findCurve(req.destinationAccount)
    // console.log(curve)
    return Promise.resolve({
      sourceAmount: destToSource(parseInt(req.destinationAmount), curve.buf).toString(),
      sourceHoldDuration: 3000
    })
  },

  findHop (address, amount) {
    const curve = this.findCurve(address)
    return {
      onwardAmount: destToSource(amount, curve.buf),
      onwardPeer: curve.peer
    }
  },

  getRoutesArray (omitPeer) {
    let arr = []
    for (let prefix of this.curves) {
      if (this.curves[prefix].peer !== omitPeer) {
        arr.push({
          destination_ledger: prefix,
          points: this.curves[prefix].curve.toString('base64')
        })
      }
    }
    return arr
  }
}

module.exports = Quoter

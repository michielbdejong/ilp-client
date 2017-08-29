// This is a simplification of https://github.com/interledgerjs/ilp-routing/blob/master/src/lib/prefix-map.js

function Quoter() {
  this.curves = {}
}

function findPoint(val, from, to, curve) {
  const array = new Uint32Array(curve, 0, curve.byteLength / 4)
  let cursor = 0
  let prev = [0, 0]
  let next = [0, 0]
  while (next[from] < val) {
    if (cursor + 3 >= array.length) {
      throw new Error('amount lies past last curve point')
    }
    const xHi = array[cursor]
    const xLo = array[cursor + 1]
    const yHi = array[cursor + 2]
    const yLo = array[cursor + 3]
    prev = next
    next = [xLo, yLo]
    cursor += 4
  }
  let perc = (val - prev[from]) / (next[from] - prev[from])
  return (prev[to] + perc * (next[to] - prev[to])).toString()
}

function sourceToDest(x, curve) {
  return findPoint(x, 0, 1, curve)
}

function destToSource(y, curve) {
  return findPoint(y, 1, 0, curve)
}

Quoter.prototype = {
  setCurve(prefix, curveBuf, peer) {
    this.curves[prefix] = {
      buf: curveBuf,
      peer
    }
  },

  findCurve(address) {
    const parts = address.split('.')
    let account = parts.pop()
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

  answerLiquidity(req) {
    const curve = this.findCurve(req.destinationAccount)
    return {
      liquidityCurve: curve.buf,
      appliesToPrefix: curve.prefix,
      sourceHoldDuration: 15000,
      expiresAt: new Date(Date.now() + 3600*1000)
    }
  },
  
  answerBySource(req) {
    const curve = this.findCurve(req.destinationAccount)
    return {
      destinationAmount: sourceToDest(parseInt(req.sourceAmount), curve.buf),
      sourceHoldDuration: 3000
    }
  },
  
  answerByDest(req) {
    const curve = this.findCurve(req.destinationAccount)
    return {
      sourceAmount: destToSource(parseInt(req.destinationAmount), curve.buf),
      sourceHoldDuration: 3000
    }
  },

  findHop(address, amount) {
    const curve = this.findCurve(address)
    return {
      onwardAmount: destToSource(amount, curve.buf),
      onwardPeer: curve.peer
    }
  }
}

module.exports = Quoter

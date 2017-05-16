const COMMISSION=1.337

function Hopper(ilpNode) {
  this.ilpNode = ilpNode
}

let calcSlope = (start, end) => ((end[1]-start[1]) / (end[0]-start[0]))
let valueAt = (candidate, pointIn) => {
  let dOut = (pointIn - candidate.startIn) * candidate.slope
  return candidate.startOut + dOut
}
let  usefulAt = (candidate, point) => (this.valueAt(candidate, point.startIn) > point.startOut)

HopperTable = function(destination, excludePeer) {
  this.sections = [] // array of objects: { startIn, startOut, slope, peerHost }
                     // sorted by startIn
                     // implied first (0, 0) point is omitted

  for (let peerHost in this.ilpNode.peers) {
    if (peerHost !== excludePeer && this.ilpNode.peers[peerHost].routes[destination]) {
      for (let i=1; i<this.ilpNode.peers[peerHost].routes[destination].length; i++) {
        let start = this.ilpNode.peers[peerHost].routes[destination][i-1]
        let end = this.ilpNode.peers[peerHost].routes[destination][i]
        let slope = calcSlope(start, end)
        this.addSection({ startIn: start[0], endIn: end[0], startOut: start[1], slope, peerHost })
      }
    }
  }
}
 
HopperTable.prototype= {
  crossover(obj, i) {
    let startDiff = valueAt(obj, this.sections[i].startIn) - this.sections[i].startOut
    let relSlope = this.sections[i].slope - obj.slope
    let crossoverIn = startDiff / relSlope
    let crossoverOut = valueAt(obj, crossoverIn)
    let parts = []
    this.sections.splice(i, 1, {
      startIn: this.sections[i].startIn,
      startOut: (startDiff < 0 ? this.sections[i].startOut : obj.startOut),
      slope: (startDiff < 0 ? this.sections[i].slope : obj.slope),
      peerHost: (startDiff < 0 ? this.sections[i].peerHost : obj.peerHost)
    },
    {
      startIn: crossoverIn,
      startOut: crossoverOut,
      slope: (startDiff < 0 ? obj.slope : this.sections[i].slope),
      peerHost: (startDiff < 0 ? obj.peerHost : this.sections[i].peerHost)
    })
  },
  addKnee(pointIn) {
    const knee = {
      startIn: pointIn,
      startOut: 0,
      slope: 0,
      peerHost: 'to be determined'
    }
    for (let i=1; i<this.sections.length; i++) {
      if (this.sections[i] > pointIn) {
        a.splice(i-1, 0, knee)
        return
      }
    }
    this.sections.push(knee)
  },
  addSection(obj) {
    let startKnee = addKnee(obj.startIn)
    let endKnee = addKnee(obj.endIn)
    for (let i = startKnee; i < endKnee; i++) {
      let usefulStart = usefulAt(obj, this.sections[i])
      let usefulEnd = usefulAt(obj, this.sections[i + 1])
      if (usefulStart) {
        if (usefulEnd) {
           this.sections[i] = obj
        } else {
          crossover(obj, i)
        }
      } else if (usefulEnd) {
        crossover(obj, i)
      }
    }
  }
}

Hopper.prototype.makeCurve = function(forPeer, toDestination) {
  let sourceRate = this.ilpNode.peers[forPeer].rate * COMMISSION
  let nextHopRate = this.ilpNode.peers[section[2]].rate
  let hopperTable = new HopperTable(toDestination, forPeer)
  return hopperTable.sections.map(section => [section[0] * sourceRate, section[1] * nextHopRate ])
}

module.exports = {
  Hopper,
  HopperTable,
  calcSlope,
  valueAt,
  usefulAt
}

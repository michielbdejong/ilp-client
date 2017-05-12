const COMMISSION=1.337

function Hopper(ilpNode) {
  this.ilpNode = ilpNode
}

Hopper.prototype.makeTable = function(destination, excludePeer) {
  let sections = []
  for (let peerHost in this.ilpNode.peers) {
    if (peerHost !== excludePeer && this.ilpNode.peers[peerHost].routes[destination]) {
      let sectionsCursor = 0
      for (let i=1; i<this.ilpNode.peers[peerHost].routes[destination].length; i++) {
        let sectionStart = this.ilpNode.peers[peerHost].routes[destination][i-1]
        let sectionEnd = this.ilpNode.peers[peerHost].routes[destination][i]
        while (sectionCursor < sections.length) {
          if (sectionStart[0] > sections[sectionCursor][0]) {
            sectionCursor++
          } else {
            if (sectionStart[1] > sections[sectionCursor]
          }
          // compare our section to the one under the cursor.
          // advance the secton cursor until we find the section with which to do crossover
          // or part of it (in which case we can use binary search to find the exact crossover.
        }
        sections.push([ sectionEnd[0], sectionEnd[1], peerHost ])
        sectionCursor++
      }
    }
  }
}

Hopper.prototype.makeCurve = function(forPeer, toDestination) {
  let sourceRate = this.ilpNode.peers[forPeer].rate * COMMISSION
  let nextHopRate = this.ilpNode.peers[section[2]].rate
  return this.makeTable(toDestination, forPeer)
    .map(section => [section[0] * sourceRate, section[1] * nextHopRate)
}

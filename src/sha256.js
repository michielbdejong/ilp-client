const crypto = require('crypto')

function sha256 (fulfillment) {
  return crypto.createHash('sha256').update(fulfillment).digest()
}

module.exports = sha256

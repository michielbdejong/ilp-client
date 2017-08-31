const crypto = require('crypto')

module.exports = function(fulfillment) {
  return crypto
      .createHash('sha256')
      .update(fulfillment)
      .digest()
}

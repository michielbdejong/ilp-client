const crypto = require('crypto')

module.exports = function (fulfillment) {
  const condition = crypto.createHash('sha256').update(fulfillment).digest()
  console.log('yes, yes,', { fulfillment, condition})
  return condition
}

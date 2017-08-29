const Quoter = require('../quoter')
const assert = require('chai').assert

describe('Quoter', () => {
  beforeEach(function () {
    this.quoter = new Quoter()
    this.quoter.setCurve('g.example.', new Uint32Array([0, 12345, 0, 67890]).buffer)
  })

  describe('answerBySource', () => {
    it('should find amount at point', function () {
      const result = this.quoter.answerBySource({
        destinationAccount: 'g.example.asdf',
        sourceAmount: '12345'
      })
      assert.deepEqual(result, {
        destinationAmount: '67890',
        sourceHoldDuration: 3000
      })
    })
  })

  describe('answerByDest', () => {
    it('should find amount at point', function () {
      const result = this.quoter.answerByDest({
        destinationAccount: 'g.example.asdf',
        destinationAmount: '67890'
      })
      assert.deepEqual(result, {
        sourceAmount: '12345',
        sourceHoldDuration: 3000
      })
    })
  })
})

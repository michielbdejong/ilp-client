const Connector = require('../connector')
const assert = require('chai').assert
const WebSocket = require('ws');

describe('Connector', () => {
  beforeEach(function () {
    this.connector = new Connector(8000)
    return this.connector.open()
  })
  afterEach(function () {
    return this.connector.close()
  })

  describe('one client', () => {
    beforeEach(function () {
      this.client1 = new WebSocket('ws://localhost:8000/path', {
        perMessageDeflate: false
      })
    })
    afterEach(function () {
      this.client1.close()
    })
    it('should connect', function (done) {
      this.client1.on('open', function open() {
        done()
      })
    })
  })
})

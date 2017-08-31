'use strict'

const WebSocket = require('ws')
const wsUri = 'wss://red.ilpdemo.org/ledger/websocket?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1MDE3NTM2MTAsImV4cCI6MjEwNjU1MzYxMCwiaXNzIjoiaHR0cHM6Ly9yZWQuaWxwZGVtby5vcmcvbGVkZ2VyIiwic3ViIjoiaHR0cHM6Ly9yZWQuaWxwZGVtby5vcmcvbGVkZ2VyL2FjY291bnRzL21pY2hpZWx0ZXN0In0.BvG2YYFQQXWfZPgQMCR619AP9l6StJV3IzYSlPKcEN4'
const ws = new WebSocket(wsUri)
ws.on('open', () => {
  console.log('ws opened: ' + wsUri)
  ws.close()
})
ws.on('error', (err) => {
  console.log('ws connection error on ' + wsUri, err)
})
ws.on('close', (code, reason) => {
  console.log('ws disconnected from ' + wsUri + ' code: ' + code + ' reason: ' + reason)
})
//ws.connect()

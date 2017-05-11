const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const keypair = require('./lib/keypair')
const getHostInfo = require('./lib/hostInfo')
const handleWebFinger = require('./lib/webfinger')
const handleRpc = require('./lib/rpc')

function IlpNode (statsFileName, credsFileName, hostname) {
  console.log('function IlpNode (', { statsFileName, credsFileName, hostname })
  this.statsFileName = statsFileName
  this.credsFileName = credsFileName
  this.hostname = hostname
  this.stats = {
    hosts: {}
  }
  this.creds = {}
  this.ready = false
  this.init().then(() => {
    this.ready = true
  })
}

IlpNode.prototype = {
  init: async function() {
    await this.readFile('stats', this.statsFileName)
    await this.readFile('creds', this.credsFileName)
    console.log(this.credsFileName, this.creds)
    if (this.creds.keypair === undefined) {
      console.log('generating keypair')
      this.creds.keypair = keypair.generate()
      console.log(this.creds.keypair)
      await this.writeFile('creds', this.credsFileName)
      console.log('saved')
    }
  },
  readFile: async function(objName, fileName) {
    await new Promise((resolve, reject) => {
      fs.readFile(fileName, (err, buf) => {
        if (err) {
          console.log(`${objName} file ${fileName} does not exist, creating.`)
          this.writeFile(objName, fileName).then(resolve)
        } else {
          try {
            this[objName] = JSON.parse(buf)
          } catch(e) {
            console.error(`${objName} file ${fileName} exists but is corrupt, fatal.`)
            reject(e)
          }
        }
        resolve()
      })
    })
  },
  writeFile: async function(objName, fileName) {
    await new Promise((resolve, reject) => {
      fs.writeFile(fileName, JSON.stringify(this[objName], null, 2), (err) => {
        if (err) {
          mkdirp(path.dirname(fileName), (err2) => {
            if (err2) {
              reject(err2)
            } else {
              fs.writeFile(fileName, JSON.stringify(this[objName], null, 2), (err3) => {
                if (err3) {
                  reject(err3)
                } else {
                  resolve()
                }
              })
            }
          })
        } else {
          resolve()
        }
      })
    })
  },
  testAll: async function() {
    const promises = []
    for (let hostname of Object.keys(this.stats.hosts)) {
      promises.push(this.testHost(this.hostname, false))
    }
    await Promise.all(promises)
    await this.writeFile('stats', this.statsFileName)
  },
  testHost: async function(testHostname, writeStats = true) {
    this.stats.hosts[testHostname] = await getHostInfo(testHostname, this.stats.hosts[testHostname] || {})
    if (writeStats) {
      await this.writeFile('stats', this.statsFileName)
    }
  },
  handleWebFinger: async function(resource) {
    return handleWebFinger(resource, this.creds, this.hostname)
  },
  handleRpc: async function(params) {
    return handleRpc(params, this.creds)
  },
}

module.exports = IlpNode

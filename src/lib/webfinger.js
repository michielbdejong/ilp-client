module.exports = (resource, creds, hostname) => {
  console.log('handling webfinger request', { resource, creds, hostname })
  if (typeof resource !== 'string') {
    return
  }
  let protocol = 'https'
  if (hostname.split(':')[0] === 'localhost') {
    protocol = 'http'
  }
  if (resource === `${protocol}://${hostname}`) {
    return {
      subject: resource,
      properties: {
        'https://interledger.org/rel/protocolVersion': 'Compatible: ilp-kit v2.0.0',
        'https://interledger.org/rel/publicKey': creds.keypair.pub
      },
      links:[
      ]
    }
  } else if (resource.startsWith('acct:')) {
    const parts = resource.substring('acct:'.length).split('@')
    if (parts[1] === hostname) {
      return {
        subject: resource,
        links: [
          { rel: 'https://interledger.org/rel/ilpAddress', href: `g.dns.${hostname.split('.').reverse().join('.')}.${parts[0]}` },
          { rel: 'https://interledger.org/rel/spsp/v2', href: `https://${hostname}/spsp` }
        ]
      }
    }
  }
}

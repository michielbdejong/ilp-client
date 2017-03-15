var request = require('request-promise-native');

var rateCache;

function getCurrencyRates() {
  if (typeof rateCache === 'object') {
    return Promise.resolve(rateCache);
  }
  return request({
    uri: 'https://api.fixer.io/latest',
    json: true,
  }).then(body => {
    if (typeof body === 'object' && typeof body.rates === 'object') {
      body.rates.EUR = 1.0000;
      return body.rates;
    }
    return {
      EUR: 1.0000,
      AUD: 1.3968,
      BGN: 1.9558,
      BRL: 3.3151,
      CAD: 1.4193,
      CHF: 1.0702,
      CNY: 7.2953,
      CZK: 27.021,
      DKK: 7.4335,
      GBP: 0.86753,
      HKD: 8.1982,
      HRK: 7.4213,
      HUF: 310.7,
      IDR: 14145,
      ILS: 3.8879,
      INR: 70.496,
      JPY: 120.65,
      KRW: 1216.4,
      MXN: 20.713,
      MYR: 4.7082,
      NOK: 8.9513,
      NZD: 1.5219,
      PHP: 53.198,
      PLN: 4.313,
      RON: 4.5503,
      RUB: 61.757,
      SEK: 9.5223,
      SGD: 1.4947,
      THB: 37.236,
      TRY: 3.9434,
      USD: 1.0556,
      ZAR: 13.791,
    };
  }).then(rates => {
    rateCache = rates;
    return rates;
  });
}

module.exports.getRate = function(currCode) {
  // console.log('getting rate for', currCode);
  return getCurrencyRates().then(rates => {
    return rates[currCode] || 1;
  });
};

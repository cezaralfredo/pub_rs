const crypto = require('crypto');

function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

function buildOAuth1Header({ method, url, apiKey, apiSecret, accessToken, accessTokenSecret, queryParams = {} }) {
  const oauthParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0'
  };

  const allParams = { ...queryParams, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();

  const paramString = sortedKeys
    .map(key => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString)
  ].join('&');

  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessTokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(key => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`);

  return `OAuth ${headerParts.join(', ')}`;
}

module.exports = {
  percentEncode,
  buildOAuth1Header
};

if (require.main === module) {
  const header = buildOAuth1Header({
    method: 'GET',
    url: 'https://api.twitter.com/2/users/me',
    apiKey: 'myApiKey',
    apiSecret: 'myApiSecret',
    accessToken: 'myAccessToken',
    accessTokenSecret: 'myTokenSecret'
  });
  console.log('Generated header:', header);
}

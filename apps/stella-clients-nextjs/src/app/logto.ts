export const logtoConfig = {
  endpoint: 'https://identity.stella.praetocloud.com/',
  appId: 'y2pki6avpc7safxxx6e6j',
  appSecret: 'REDACTED',
  baseUrl: 'http://localhost:3000', // Change to your own base URL
  cookieSecret: 'REDACTED', // Auto-generated 32 digit secret
  cookieSecure: process.env.NODE_ENV === 'production',
};

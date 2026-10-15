export const STELLA_ADMIN_API_RESOURCE = 'https://api.stella.praetocloud.com/v1';
export const TRADING_ENGINE_API_RESOURCE = 'https://api.stella.praetocloud.com/t_engx/v1';

export const logtoConfig = {
  endpoint: process.env.LOGTO_ENDPOINT || 'https://auth.stella.praetocloud.com/',
  appId: process.env.LOGTO_APP_ID || 'nqmjr1qa0y51eq3vmy6mo',
  appSecret: process.env.LOGTO_APP_SECRET || 'R6KMd1C3hWqnJBvMA9pyYPjhDP8UUTdZ',
  baseUrl: process.env.LOGTO_BASE_URL || 'http://localhost:3000',
  cookieSecret: process.env.LOGTO_COOKIE_SECRET || '1R1vA9thhOi6oUJGrYIR5r5iV9AIMh63',
  cookieSecure: process.env.NODE_ENV === 'production',
  resources: [STELLA_ADMIN_API_RESOURCE, TRADING_ENGINE_API_RESOURCE],
};

import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  enabled: process.env.AUTH_ENABLED === 'true',
  logtoDomain: process.env.LOGTO_DOMAIN || 'https://identity.stella.praetocloud.com',
  // Cache TTL for admin permissions (in seconds)
  permissionsCacheTtlSeconds: parseInt(
    process.env.PERMISSIONS_CACHE_TTL || '300',
    10,
  ), // 5 minutes
  // Logto Machine-to-Machine app credentials for Management API
  logtoM2mAppId: process.env.LOGTO_M2M_APP_ID || '',
  logtoM2mAppSecret: process.env.LOGTO_M2M_APP_SECRET || '',
  logtoManagementApiResource: process.env.LOGTO_MANAGEMENT_API_RESOURCE || '',
}));

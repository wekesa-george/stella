import { registerAs } from '@nestjs/config';

export default registerAs('coolify', () => ({
  apiUrl: process.env.COOLIFY_API_URL || '',
  apiToken: process.env.COOLIFY_API_TOKEN || '',
  projectUuid: process.env.COOLIFY_PROJECT_UUID || '',
  environment: process.env.COOLIFY_ENVIRONMENT || 'development',
}));

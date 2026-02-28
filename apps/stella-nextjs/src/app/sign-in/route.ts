import { signIn } from '@logto/next/server-actions';
import { logtoConfig } from '../logto';

export async function GET() {
  await signIn(logtoConfig, `${logtoConfig.baseUrl}/callback`);
}

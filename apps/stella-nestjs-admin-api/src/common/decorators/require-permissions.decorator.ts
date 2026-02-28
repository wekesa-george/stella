import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Require one or more permissions to access a route.
 * The user must have ALL listed permissions (AND logic).
 *
 * Usage:
 *   @RequirePermissions('users.view')
 *   @RequirePermissions('kyc.approve', 'kyc.view_applicants')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

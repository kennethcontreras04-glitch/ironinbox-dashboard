import { useCallback, useMemo } from 'react';
import {
  ROLE_PERMISSIONS,
  type RolePermissions,
  type UserRole,
} from '../types/roles';
import { useAuth } from '../contexts/useAuth';

export function useRole() {
  const { user } = useAuth();

  const role: UserRole =
    user?.role === 'admin' ||
    user?.role === 'manager' ||
    user?.role === 'viewer'
      ? user.role
      : 'viewer';

  const permissions = useMemo(
    () => ROLE_PERMISSIONS[role],
    [role]
  );

  const hasPermission = useCallback(
    (key: keyof RolePermissions) => Boolean(permissions[key]),
    [permissions]
  );

  return { role, permissions, hasPermission };
}
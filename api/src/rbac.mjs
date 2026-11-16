
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  VIEWER: 'viewer',
});

export const PERMISSIONS = Object.freeze({
  VIEW_EMAILS: 'viewEmails',
  VIEW_KEYWORDS: 'viewKeywords',
  VIEW_ENGAGEMENT_LOG: 'viewEngagementLog',
  MANAGE_EMAILS: 'manageEmails',
  MANAGE_MONITORING: 'manageMonitoring',
  MANAGE_ROLES: 'manageRoles',
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: Object.values(PERMISSIONS),
  manager: [
    PERMISSIONS.VIEW_EMAILS,
    PERMISSIONS.VIEW_KEYWORDS,
    PERMISSIONS.MANAGE_EMAILS,
    PERMISSIONS.MANAGE_MONITORING,
  ],
  viewer: [],
});

export function normalizeRole(role) {
  return Object.values(ROLES).includes(role)
    ? role
    : ROLES.VIEWER;
}

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission);
}

export function requirePermission(role, permission) {
  if (!hasPermission(role, permission)) {
    const error = new Error(
      'You do not have permission to perform this action.'
    );
    error.status = 403;
    throw error;
  }
}

import { getJson, patchJson } from './client';

export type AdminUser = {
  id: string;
  email: string;
  is_admin: boolean;
  updated_at?: string | null;
};

export type AdminUsersPage = {
  items: AdminUser[];
  count: number;
};

export function searchAdminUsers(q: string, limit = 30) {
  const params = new URLSearchParams();
  const needle = q.trim();
  if (needle) params.set('q', needle);
  params.set('limit', String(limit));
  return getJson<AdminUsersPage>(`/admin/users?${params}`);
}

export function setUserAdmin(userId: string, isAdmin: boolean) {
  return patchJson<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    is_admin: isAdmin,
  });
}

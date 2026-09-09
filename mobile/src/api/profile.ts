import { getJson, patchJson } from './client';

export type UserProfileDetails = {
  id: string;
  email: string;
  is_admin: boolean;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  updated_at?: string | null;
};

export type ProfileUpdate = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

export function fetchMyProfile() {
  return getJson<UserProfileDetails>('/auth/profile');
}

export function updateMyProfile(body: ProfileUpdate) {
  return patchJson<UserProfileDetails>('/auth/profile', body);
}

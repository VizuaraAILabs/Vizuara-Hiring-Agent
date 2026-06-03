export interface AuthUser {
  sub: string;
  companyId?: string | null;
  memberId?: string | null;
  email: string;
  name: string;
  role?: string | null;
  isAdmin?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

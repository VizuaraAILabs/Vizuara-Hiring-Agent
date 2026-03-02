export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  isAdmin?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

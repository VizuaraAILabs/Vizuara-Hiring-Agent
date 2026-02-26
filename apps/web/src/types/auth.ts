export interface AuthUser {
  sub: string;
  email: string;
  name: string;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

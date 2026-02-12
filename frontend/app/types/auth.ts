export interface AuthUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

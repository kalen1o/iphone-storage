export type AuthUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};


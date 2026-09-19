import { UserRole } from "@shop/database";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
  name: string;
}

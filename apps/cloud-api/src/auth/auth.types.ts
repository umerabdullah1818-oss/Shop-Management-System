import { UserRole } from "@shop/database";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  name: string;
}

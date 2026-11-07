import { Request } from "express";

export type RoleCode =
  | "admin"
  | "business_head"
  | "sales_executive"
  | "marketing_executive";

export type RoleName =
  | "Admin"
  | "Business Head"
  | "Sales Executive"
  | "Marketing Executive";

export interface Role {
  id: string;
  code: RoleCode;
  name: RoleName;
  description?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roleId: string;
  role: RoleCode;
  roleName: RoleName;
  firstName: string;
  lastName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface UserProfileResponse {
  id: string;
  email: string;
  roleId: string;
  role: RoleCode;
  roleName: RoleName;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  lastLogin?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: "Bearer";
}

export interface AuthSuccessResponse {
  user: UserProfileResponse;
  tokens: TokenPair;
}

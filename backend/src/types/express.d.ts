export interface AuthUser {
  id: string;
  email: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  managerId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

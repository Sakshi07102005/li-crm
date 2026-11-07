export interface AuthUser {
  id: string;
  email: string;
  roleCode: string;
  roleName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}


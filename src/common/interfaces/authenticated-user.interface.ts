import { UserRole } from 'generated/prisma/enums';

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedUser {
  id: string;
}

export interface ActiveUser {
  id: string;
  username: string;
}

export interface CurrentUser extends ActiveUser {
  firstName: string;
  lastName: string;
  roleName: string;
  permissions: string[];
}

export interface EmployeeUser {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export interface EmployeeWithUser {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string | null;
  contactNumber: string | null;
  position: string | null;
  receivesSmsAlerts: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: EmployeeUser;
}

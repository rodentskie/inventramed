import type { EmployeeWithUser } from '../../../src/types/employee';
import type { RoleSummary } from '../../../src/types/role';

export const EMPLOYEE_ID = '3f2b7c1e-8a4d-4e6f-9b1a-2c3d4e5f6a7b';
export const USER_ID = '5b4d9e3a-0c6f-4a8b-9d3c-4e5f6a7b8c9d';
export const STAFF_ROLE_ID = '6c5eaf4b-1d7a-4b9c-8e4d-5f6a7b8c9d0e';
export const ADMIN_ROLE_ID = '7d6fb05c-2e8b-4c0d-9f5e-6a7b8c9d0e1f';

export const ROLES: RoleSummary[] = [
  { id: ADMIN_ROLE_ID, name: 'admin', description: 'Full access' },
  { id: STAFF_ROLE_ID, name: 'staff', description: 'Manages medicines and stock' },
];

export function employee(overrides: Partial<EmployeeWithUser> = {}): EmployeeWithUser {
  return {
    id: EMPLOYEE_ID,
    firstName: 'Ana',
    middleName: null,
    lastName: 'Cruz',
    email: 'ana@example.com',
    contactNumber: '+639171234567',
    position: 'Pharmacist',
    receivesSmsAlerts: true,
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    user: {
      id: USER_ID,
      username: 'anacruz',
      roleId: STAFF_ROLE_ID,
      role: 'staff',
      isActive: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

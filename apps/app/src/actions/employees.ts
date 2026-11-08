'use server';

import { revalidatePath } from 'next/cache';
import { runAction } from '@/lib/action-result';
import { parseInput } from '@/lib/api-response';
import { requirePermission } from '@/lib/auth';
import {
  createEmployee,
  softDeleteEmployee,
  updateEmployee,
} from '@/lib/employees';
import { EMPLOYEE_PERMISSIONS } from '@/lib/permissions';
import { idSchema } from '@/lib/validations/common';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from '@/lib/validations/employee';
import type { ActionResult } from '@/types/action';
import type { EmployeeWithUser } from '@/types/employee';

const LIST_PATH = '/employees';

function revalidateEmployee(id: string) {
  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${id}`);
}

export async function createEmployeeAction(
  input: unknown,
): Promise<ActionResult<EmployeeWithUser>> {
  return runAction(async () => {
    await requirePermission(...EMPLOYEE_PERMISSIONS);
    const employee = await createEmployee(parseInput(createEmployeeSchema, input));
    revalidateEmployee(employee.id);
    return employee;
  });
}

export async function updateEmployeeAction(
  employeeId: unknown,
  input: unknown,
): Promise<ActionResult<EmployeeWithUser>> {
  return runAction(async () => {
    const user = await requirePermission(...EMPLOYEE_PERMISSIONS);
    const id = parseInput(idSchema, employeeId);
    const employee = await updateEmployee(user.id, id, parseInput(updateEmployeeSchema, input));
    revalidateEmployee(id);
    return employee;
  });
}

export async function setEmployeeActiveAction(
  employeeId: unknown,
  isActive: unknown,
): Promise<ActionResult<EmployeeWithUser>> {
  return runAction(async () => {
    const user = await requirePermission(...EMPLOYEE_PERMISSIONS);
    const id = parseInput(idSchema, employeeId);
    const employee = await updateEmployee(
      user.id,
      id,
      parseInput(updateEmployeeSchema, { isActive }),
    );
    revalidateEmployee(id);
    return employee;
  });
}

export async function deleteEmployeeAction(
  employeeId: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requirePermission(...EMPLOYEE_PERMISSIONS);
    const id = parseInput(idSchema, employeeId);
    const result = await softDeleteEmployee(user.id, id);
    revalidateEmployee(id);
    return result;
  });
}

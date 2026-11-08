import { Tag } from '@inventra-med/components';

export function EmployeeStatusTag({ isActive }: { isActive: boolean }) {
  return (
    <Tag size="sm" variant="outline" colorPalette={isActive ? 'green' : 'gray'}>
      {isActive ? 'Active' : 'Inactive'}
    </Tag>
  );
}

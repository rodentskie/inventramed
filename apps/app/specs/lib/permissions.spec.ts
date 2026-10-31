import { hasPermission, permissionSchema } from '../../src/lib/permissions';

describe('hasPermission', () => {
  it('grants an exact match', () => {
    expect(hasPermission(['medicine:read'], 'medicine:read')).toBe(true);
  });

  it('grants via resource wildcard', () => {
    expect(hasPermission(['medicine:*'], 'medicine:write')).toBe(true);
  });

  it('grants everything via global wildcard', () => {
    expect(hasPermission(['*'], 'audit:read')).toBe(true);
  });

  it('denies by default', () => {
    expect(hasPermission([], 'medicine:read')).toBe(false);
    expect(hasPermission(['medicine:read'], 'medicine:write')).toBe(false);
  });

  it("does not match another resource's wildcard", () => {
    expect(hasPermission(['inventory:*'], 'medicine:read')).toBe(false);
  });
});

describe('permissionSchema', () => {
  it.each(['medicine:read', 'settings:manage', 'inventory:*', '*'])(
    'accepts %s',
    (value) => {
      expect(permissionSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each(['medicine:create', 'medicines:read', 'unknown:*', ''])(
    'rejects %s',
    (value) => {
      expect(permissionSchema.safeParse(value).success).toBe(false);
    },
  );
});

import { screen } from '@testing-library/react';
import LoginPage from '../../src/app/login/page';
import { getActiveUser } from '../../src/lib/auth';
import { renderWithChakra } from '../test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getActiveUser: jest.fn() }));
jest.mock('@inventra-med/components', () => ({
  ...jest.requireActual('@inventra-med/components'),
  ColorModeButton: () => <button>Toggle color mode</button>,
}));

const getActiveUserMock = getActiveUser as jest.Mock;

describe('LoginPage', () => {
  it('redirects an active user to /', async () => {
    getActiveUserMock.mockResolvedValue({ id: 'user-1', username: 'admin' });

    await expect(LoginPage()).rejects.toThrow('redirect:/');
  });

  it('shows the form without an active user', async () => {
    getActiveUserMock.mockResolvedValue(null);

    renderWithChakra(await LoginPage());

    expect(screen.getByRole('heading', { name: 'InventraMed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});

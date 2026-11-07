import { screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import Page from '../src/app/page';
import { getActiveUser } from '../src/lib/auth';
import { renderWithChakra } from './test-utils';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }));
jest.mock('@/lib/auth', () => ({ getActiveUser: jest.fn() }));

const getActiveUserMock = getActiveUser as jest.Mock;

describe('Page', () => {
  it('redirects to /login without an active user', async () => {
    getActiveUserMock.mockResolvedValue(null);

    await expect(Page()).rejects.toThrow('redirect:/login');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('shows the username and a sign-out button', async () => {
    getActiveUserMock.mockResolvedValue({ id: 'user-1', username: 'admin' });

    renderWithChakra(await Page());

    expect(screen.getByText('Signed in as admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});

import { toaster } from '@inventra-med/components';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import { LoginForm } from '../../../src/components/auth/LoginForm';
import { renderWithChakra } from '../../test-utils';

const replaceMock = jest.fn();
const refreshMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));
jest.mock('next-auth/react', () => ({ signIn: jest.fn() }));

const signInMock = signIn as jest.Mock;
const GENERIC_ERROR = 'Something went wrong. Please try again.';

function usernameInput() {
  return screen.getByLabelText('Username') as HTMLInputElement;
}

function passwordInput() {
  return screen.getByLabelText('Password') as HTMLInputElement;
}

function submitButton() {
  return screen.getByRole('button', {
    name: /^sign(ing)? in$/i,
  }) as HTMLButtonElement;
}

function fillAndSubmit() {
  fireEvent.change(usernameInput(), { target: { value: 'admin' } });
  fireEvent.change(passwordInput(), { target: { value: 'secret' } });
  fireEvent.click(submitButton());
}

describe('LoginForm', () => {
  let toastMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    toastMock = jest.spyOn(toaster, 'create').mockReturnValue('toast-id');
  });

  afterEach(() => {
    toastMock.mockRestore();
  });

  it('shows inline errors for an empty submit and does not call signIn', () => {
    renderWithChakra(<LoginForm />);

    fireEvent.click(submitButton());

    expect(screen.getByText('Enter your username.')).toBeTruthy();
    expect(screen.getByText('Enter your password.')).toBeTruthy();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('clears inline errors once the form is valid', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null });
    renderWithChakra(<LoginForm />);

    fireEvent.click(submitButton());
    fillAndSubmit();

    await waitFor(() => expect(signInMock).toHaveBeenCalled());
    expect(screen.queryByText('Enter your username.')).toBeNull();
  });

  it('signs in without a redirect and goes to / on success', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null });
    renderWithChakra(<LoginForm />);

    fillAndSubmit();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    expect(refreshMock).toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      username: 'admin',
      password: 'secret',
      redirect: false,
      callbackUrl: '/',
    });
    expect(toastMock).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(true);
  });

  it.each([
    ['CredentialsSignin', 'Incorrect username or password.'],
    ['Try again after 5 minutes', 'Too many attempts. Try again after 5 minutes.'],
    ['Try again after 1 minute', 'Too many attempts. Try again after 1 minute.'],
  ])('clears the password after %s', async (error, title) => {
    signInMock.mockResolvedValue({ ok: false, error });
    renderWithChakra(<LoginForm />);

    fillAndSubmit();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({ type: 'error', title }),
    );
    await waitFor(() => expect(passwordInput().value).toBe(''));
    expect(usernameInput().value).toBe('admin');
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('never shows other server text and keeps the fields', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'Visit evil.example' });
    renderWithChakra(<LoginForm />);

    fillAndSubmit();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        type: 'error',
        title: GENERIC_ERROR,
      }),
    );
    expect(passwordInput().value).toBe('secret');
  });

  it('shows the generic message when the request fails', async () => {
    signInMock.mockRejectedValue(new Error('Network down'));
    renderWithChakra(<LoginForm />);

    fillAndSubmit();

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        type: 'error',
        title: GENERIC_ERROR,
      }),
    );
    expect(passwordInput().value).toBe('secret');
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });

  it('blocks a second submit while a request is in flight', async () => {
    let finish: (value: unknown) => void = () => undefined;
    signInMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithChakra(<LoginForm />);

    fillAndSubmit();
    expect(submitButton().disabled).toBe(true);

    const form = usernameInput().form as HTMLFormElement;
    fireEvent.submit(form);
    expect(signInMock).toHaveBeenCalledTimes(1);

    finish({ ok: false, error: 'CredentialsSignin' });
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });
});

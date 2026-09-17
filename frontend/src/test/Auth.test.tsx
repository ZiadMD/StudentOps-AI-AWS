import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../components/auth/LoginPage';
import { RegisterPage } from '../components/auth/RegisterPage';
import { api } from '../api/client';
import type { TeamItem, TokenResponse } from '../types';

vi.mock('../api/client', () => ({ api: { login: vi.fn(), register: vi.fn(), getTeams: vi.fn() } }));

const response: TokenResponse = {
  access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer',
  user: { id: 'usr_test', email: 'member@example.test', full_name: 'Test Member', role: 'member', is_active: true, created_at: '2026-01-01' },
};
const teams: TeamItem[] = [{ id: 'team_test', name: 'Events', code: 'EV', description: '', created_at: '2026-01-01', member_count: 0 }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fillCredentials(password = '  secret pass  ') {
  change('Email address', 'member@example.test');
  change('Password', password);
}
function fillRegistration(password = '  secret pass  ') {
  change('Full name (English)', ' Test Member ');
  fillCredentials(password);
}
async function renderRegister(onRegister = vi.fn(), onGoToLogin = vi.fn()) {
  render(<RegisterPage onRegister={onRegister} onGoToLogin={onGoToLogin} />);
  await screen.findByRole('option', { name: 'Events (EV)' });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getTeams).mockResolvedValue(teams);
  vi.mocked(api.login).mockResolvedValue(response);
  vi.mocked(api.register).mockResolvedValue(response);
});
afterEach(cleanup);

describe('Authentication presentation and navigation', () => {
  it.each(['login', 'register'] as const)('renders %s with no demo accounts and accessible password visibility', async (page) => {
    if (page === 'login') render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    else await renderRegister();
    expect(document.body).not.toHaveTextContent(/demo|sandbox|verified|@studentops/i);
    expect(screen.getByRole('link', { name: 'StudentOps home' })).toHaveAttribute('href', '/');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    change('Password', 'unchanged password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('unchanged password');
    expect(api.login).not.toHaveBeenCalled();
    expect(api.register).not.toHaveBeenCalled();
  });

  it.each(['login', 'register'] as const)('preserves real %s crosslinks and only intercepts unmodified primary clicks', async (page) => {
    const navigate = vi.fn();
    if (page === 'login') render(<LoginPage onLogin={vi.fn()} onGoToRegister={navigate} />);
    else await renderRegister(vi.fn(), navigate);
    const link = screen.getByRole('link', { name: page === 'login' ? 'Create an account' : 'Sign in' });
    expect(link).toHaveAttribute('href', page === 'login' ? '/signup' : '/login');
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(fireEvent.click(link, options)).toBe(true);
    }
    expect(navigate).not.toHaveBeenCalled();
    expect(fireEvent.click(link)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

describe('Login', () => {
  it('validates email and missing password without contacting the API', () => {
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    const form = screen.getByRole('form');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    change('Email address', 'invalid');
    fireEvent.submit(form);
    expect(api.login).not.toHaveBeenCalled();
    change('Email address', 'member@example.test');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your password.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('sends passwords unchanged, prevents duplicate submits, and invokes the existing callback', async () => {
    const request = deferred<TokenResponse>();
    vi.mocked(api.login).mockReturnValueOnce(request.promise);
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} onGoToRegister={vi.fn()} />);
    fillCredentials();
    fireEvent.submit(screen.getByRole('form'));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Signing in. Please wait.');
    fireEvent.submit(screen.getByRole('form'));
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.login).toHaveBeenCalledWith({ email: 'member@example.test', password: '  secret pass  ' });
    await act(async () => { request.resolve(response); });
    expect(onLogin).toHaveBeenCalledWith(response.user);
  });

  it('shows API errors without losing input and allows retry', async () => {
    vi.mocked(api.login).mockRejectedValueOnce(new Error('Invalid credentials.'));
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} onGoToRegister={vi.fn()} />);
    fillCredentials();
    fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials.');
    expect(screen.getByLabelText('Email address')).toHaveValue('member@example.test');
    expect(screen.getByLabelText('Password')).toHaveValue('  secret pass  ');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(onLogin).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(response.user));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers honest recovery guidance, traps focus, and restores focus on dismissal', () => {
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    fillCredentials();
    const trigger = screen.getByRole('button', { name: 'Forgot password?' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Need help signing in?' });
    expect(dialog).toHaveTextContent('Contact your organization administrator');
    expect(dialog).toHaveTextContent('No reset request has been sent.');
    expect(dialog).not.toHaveTextContent('@');
    const close = within(dialog).getByRole('button', { name: 'Close dialog' });
    const back = within(dialog).getByRole('button', { name: 'Back to sign in' });
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByLabelText('Password')).toHaveValue('  secret pass  ');
    expect(api.login).not.toHaveBeenCalled();
  });
});

describe('Registration', () => {
  it('is a single step with labeled bilingual names and a blank optional team', async () => {
    await renderRegister();
    expect(screen.getByLabelText('Full name (English)')).toBeRequired();
    expect(screen.getByLabelText(/الاسم بالعربية/)).toHaveAttribute('dir', 'rtl');
    expect(screen.getByLabelText(/الاسم بالعربية/)).toHaveClass("font-['Cairo']");
    expect(screen.getByLabelText(/الاسم بالعربية/)).not.toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8');
    expect(screen.getByRole('combobox', { name: 'Team (optional)' })).toHaveValue('');
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('validates name, email, and minimum password length before calling the API', async () => {
    await renderRegister();
    const form = screen.getByRole('form');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your full name in English.');
    change('Full name (English)', 'Test Member');
    change('Email address', 'invalid');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    fillCredentials('1234567');
    fireEvent.submit(form);
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters.');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('preserves the member API contract and does not assign a team automatically', async () => {
    const onRegister = vi.fn();
    await renderRegister(onRegister);
    fillRegistration('12345678');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(response.user));
    expect(api.register).toHaveBeenCalledWith({ email: 'member@example.test', password: '12345678', full_name: 'Test Member', arabic_name: undefined, role: 'member', team_id: undefined });
  });

  it('sends selected team and Arabic name, preserves input on failure, and can retry', async () => {
    const request = deferred<TokenResponse>();
    vi.mocked(api.register).mockReturnValueOnce(request.promise);
    const onRegister = vi.fn();
    await renderRegister(onRegister);
    fillRegistration();
    change(/الاسم بالعربية/, ' عضو اختبار ');
    change('Team (optional)', 'team_test');
    fireEvent.submit(screen.getByRole('form'));
    expect(screen.getByRole('button', { name: 'Creating account…' })).toBeDisabled();
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    fireEvent.submit(screen.getByRole('form'));
    expect(api.register).toHaveBeenCalledTimes(1);
    expect(api.register).toHaveBeenCalledWith({ email: 'member@example.test', password: '  secret pass  ', full_name: 'Test Member', arabic_name: 'عضو اختبار', role: 'member', team_id: 'team_test' });
    await act(async () => { request.reject(new Error('Email already registered.')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Email already registered.');
    expect(screen.getByLabelText('Password')).toHaveValue('  secret pass  ');
    expect(screen.getByLabelText('Full name (English)')).toHaveValue(' Test Member ');
    expect(screen.getByLabelText(/الاسم بالعربية/)).toHaveValue(' عضو اختبار ');
    expect(screen.getByLabelText('Email address')).toHaveValue('member@example.test');
    expect(screen.getByRole('combobox')).toHaveValue('team_test');
    expect(onRegister).not.toHaveBeenCalled();
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(response.user));
  });

  it('shows team load errors and retries without losing profile input or selecting a team', async () => {
    vi.mocked(api.getTeams).mockRejectedValueOnce(new Error('Offline'));
    render(<RegisterPage onRegister={vi.fn()} onGoToLogin={vi.fn()} />);
    fillRegistration();
    expect(await screen.findByRole('alert')).toHaveTextContent('Teams could not be loaded.');
    expect(screen.getByRole('combobox')).toBeDisabled();
    const request = deferred<TeamItem[]>();
    vi.mocked(api.getTeams).mockReturnValueOnce(request.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading teams' }));
    expect(screen.getByText('Loading teams…')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Retry loading teams' })).not.toBeInTheDocument();
    await act(async () => { request.resolve(teams); });
    expect(screen.getByRole('combobox')).toBeEnabled();
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('  secret pass  ');
    expect(api.getTeams).toHaveBeenCalledTimes(2);
  });

  it.each(['empty', 'failed'] as const)('allows registration without a team when the team list is %s', async (state) => {
    if (state === 'empty') vi.mocked(api.getTeams).mockResolvedValueOnce([]);
    else vi.mocked(api.getTeams).mockRejectedValueOnce(new Error('Offline'));
    const onRegister = vi.fn();
    render(<RegisterPage onRegister={onRegister} onGoToLogin={vi.fn()} />);
    await screen.findByText(state === 'empty' ? 'No teams are available. You can continue without one.' : 'Teams could not be loaded.');
    fillRegistration();
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(response.user));
    expect(api.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'member', team_id: undefined }));
  });
});

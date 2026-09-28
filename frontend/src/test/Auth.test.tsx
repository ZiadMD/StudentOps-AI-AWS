import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../components/auth/LoginPage';
import { RegisterPage } from '../components/auth/RegisterPage';
import { api } from '../api/client';
import type { TeamItem, TokenResponse } from '../types';

vi.mock('../api/client', () => ({ api: { login: vi.fn(), register: vi.fn(), getTeams: vi.fn() } }));

const response: TokenResponse = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  token_type: 'bearer',
  user: {
    id: 'usr_test',
    email: 'member@example.test',
    full_name: 'Test Member',
    role: 'member',
    is_active: true,
    created_at: '2026-01-01',
  },
};

const teams: TeamItem[] = [
  { id: 'team_test', name: 'Events', code: 'EV', description: '', created_at: '2026-01-01', member_count: 0 },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function change(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getTeams).mockResolvedValue(teams);
  vi.mocked(api.login).mockResolvedValue(response);
  vi.mocked(api.register).mockResolvedValue(response);
});

afterEach(cleanup);

describe('Login', () => {
  it('accepts an email address or a username and does not contact the API when empty', () => {
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email address or username.');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email that still contains an at sign', () => {
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    change('Email address or username', 'member@example');
    change('Password', 'secret pass');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email address or username.');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('accepts a bare username, the documented alternative to an email', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} onGoToRegister={vi.fn()} />);
    change('Email address or username', 'testmember');
    change('Password', 'secret pass');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(response.user));
    expect(api.login).toHaveBeenCalledWith({ email: 'testmember', password: 'secret pass' });
  });

  it('sends the password unchanged and prevents a duplicate submit', async () => {
    const onLogin = vi.fn();
    const pending = deferred<TokenResponse>();
    vi.mocked(api.login).mockReturnValue(pending.promise);
    render(<LoginPage onLogin={onLogin} onGoToRegister={vi.fn()} />);
    change('Email address or username', 'member@example.test');
    change('Password', '  secret pass  ');

    const submit = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.login).toHaveBeenCalledWith({ email: 'member@example.test', password: '  secret pass  ' });

    pending.resolve(response);
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(response.user));
  });

  it('shows an API error without losing the entered values and allows a retry', async () => {
    vi.mocked(api.login)
      .mockRejectedValueOnce(new Error('Those credentials do not match our records.'))
      .mockResolvedValueOnce(response);
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} onGoToRegister={vi.fn()} />);
    change('Email address or username', 'member@example.test');
    change('Password', 'secret pass');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');

    expect(screen.getByRole('alert')).toHaveTextContent('Those credentials do not match our records.');
    expect(screen.getByLabelText('Email address or username')).toHaveValue('member@example.test');
    expect(screen.getByLabelText('Password')).toHaveValue('secret pass');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(response.user));
  });

  it('states that an administrator handles recovery and sends no reset request', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Password recovery is handled by your organization administrator.');
    expect(screen.getByRole('dialog')).toHaveTextContent('No reset request has been sent.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns focus to the trigger when recovery is dismissed', async () => {
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Forgot password?' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('exposes no demo accounts and toggles password visibility', () => {
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);

    expect(document.body).not.toHaveTextContent(/demo|sandbox|verified|@studentops/i);
    expect(screen.getByRole('link', { name: 'StudentOps home' })).toHaveAttribute('href', '/');

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    change('Password', 'unchanged password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('unchanged password');
  });

  it('gives the context panel a moving colour field behind its text', () => {
    const { container } = render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    const panel = container.querySelector<HTMLElement>('.auth-panel')!;

    // Three drifting blooms plus the hairline grid. Each bloom must be marked
    // decorative so a screen reader never announces an empty div.
    const blooms = panel.querySelectorAll('.auth-panel__bloom');
    expect(blooms).toHaveLength(3);
    for (const bloom of blooms) {
      expect(bloom).toHaveAttribute('aria-hidden', 'true');
    }
    expect(panel.querySelector('.auth-panel__grid')).toHaveAttribute('aria-hidden', 'true');

    // The wordmark and the context copy must sit above the blooms, or the
    // moving colour would render over the text.
    for (const selector of ['a[aria-label="StudentOps home"]', 'aside[aria-label="About StudentOps"]']) {
      expect(panel.querySelector(selector)!.className).toContain('z-10');
    }
  });

  it('keeps the panel content readable by pairing light text with the dark field', () => {
    const { container } = render(<LoginPage onLogin={vi.fn()} onGoToRegister={vi.fn()} />);
    const aside = container.querySelector<HTMLElement>('aside[aria-label="About StudentOps"]')!;
    const heading = within(aside).getByRole('heading', { level: 2 });
    expect(heading.className).toContain('text-white');
    // Every term and definition in the panel sits on the dark field, so each
    // one has to carry a light text colour of its own.
    for (const term of within(aside).getAllByRole('term')) {
      expect(term.className).toContain('text-white');
    }
    for (const detail of within(aside).getAllByRole('definition')) {
      expect(detail.className).toContain('text-slate-400');
    }
  });

  it('routes to the sign-up screen from the join link', () => {
    const onGoToRegister = vi.fn();
    render(<LoginPage onLogin={vi.fn()} onGoToRegister={onGoToRegister} />);
    const link = screen.getByRole('link', { name: 'Create an account' });
    expect(link).toHaveAttribute('href', '/signup');
    fireEvent.click(link);
    expect(onGoToRegister).toHaveBeenCalled();
  });
});

describe('Registration', () => {
  async function renderRegister() {
    const onRegister = vi.fn();
    const onGoToLogin = vi.fn();
    render(<RegisterPage onRegister={onRegister} onGoToLogin={onGoToLogin} />);
    await screen.findByRole('option', { name: 'Events (EV)' });
    return { onRegister, onGoToLogin };
  }

  it('offers a blank optional committee so nobody is auto-assigned', async () => {
    await renderRegister();
    expect(screen.getByRole('option', { name: 'No committee selected' })).toHaveValue('');
    expect(screen.getByLabelText(/الاسم بالعربية/)).toHaveAttribute('dir', 'rtl');
    expect(screen.getByLabelText(/^Committee/)).toHaveValue('');
  });

  it('validates name, email and minimum password length before calling the API', async () => {
    const { onRegister } = await renderRegister();

    change('Full name', '   ');
    change('Email address', 'not-an-email');
    change('Password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
    expect(onRegister).not.toHaveBeenCalled();
  });

  it('sends the selected committee and Arabic name and does not trim the password', async () => {
    const { onRegister } = await renderRegister();
    change('Full name', ' Test Member ');
    change(/الاسم/, 'عضو اختبار');
    change('Email address', 'member@example.test');
    change('Password', '  secret pass  ');
    fireEvent.change(screen.getByLabelText(/^Committee/), { target: { value: 'team_test' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(response.user));

    expect(api.register).toHaveBeenCalledWith({
      email: 'member@example.test',
      password: '  secret pass  ',
      full_name: 'Test Member',
      arabic_name: 'عضو اختبار',
      role: 'member',
      team_id: 'team_test',
    });
  });

  it('allows registration without a committee when the list is empty', async () => {
    vi.mocked(api.getTeams).mockResolvedValue([]);
    const onRegister = vi.fn();
    render(<RegisterPage onRegister={onRegister} onGoToLogin={vi.fn()} />);
    await waitFor(() => expect(api.getTeams).toHaveBeenCalled());

    change('Full name', 'Test Member');
    change('Email address', 'member@example.test');
    change('Password', 'secret pass');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(response.user));
    // An unselected committee is sent as undefined so the API applies its own
    // default rather than receiving an empty string it might treat as a value.
    expect(api.register).toHaveBeenCalledWith(
      expect.objectContaining({ team_id: undefined, full_name: 'Test Member' }),
    );
  });

  it('preserves input when the API fails and allows a retry', async () => {
    vi.mocked(api.register)
      .mockRejectedValueOnce(new Error('That email is already registered.'))
      .mockResolvedValueOnce(response);
    const { onRegister } = await renderRegister();
    change('Full name', 'Test Member');
    change('Email address', 'member@example.test');
    change('Password', 'secret pass');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('alert');

    expect(screen.getByRole('alert')).toHaveTextContent('That email is already registered.');
    expect(screen.getByLabelText('Email address')).toHaveValue('member@example.test');

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onRegister).toHaveBeenCalledWith(response.user));
  });

  it('routes back to sign in', async () => {
    const { onGoToLogin } = await renderRegister();
    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/login');
    fireEvent.click(link);
    expect(onGoToLogin).toHaveBeenCalled();
  });
});

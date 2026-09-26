import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StudentsPage } from '../components/StudentsPage';
import { ToastProvider } from '../context/ToastContext';
import { api } from '../api/client';
import { UserProfile, Student } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getStudents: vi.fn(),
    createStudent: vi.fn(),
    getTeams: vi.fn(),
  },
}));

const mockAdminUser: UserProfile = {
  id: 'usr_admin',
  email: 'admin@studentops.org',
  full_name: 'Admin User',
  role: 'hr_admin',
  is_active: true,
  created_at: new Date().toISOString(),
};

const mockStudents: Student[] = [
  {
    id: 'std_1',
    student_code: 'CORE-2026-001',
    full_name: 'Ziad Mohamed',
    arabic_name: 'زياد محمد',
    email: 'ziad.member@studentops.org',
    phone: '+20 100 123 4567',
    university: 'Faculty of Engineering',
    role: 'Member',
    status: 'ACTIVE',
    team_id: 'team_tech',
    created_at: new Date().toISOString(),
  },
];

describe('StudentsPage & Add Member Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getStudents).mockResolvedValue([...mockStudents]);
    vi.mocked(api.getTeams).mockResolvedValue([
      { id: 'team_tech', name: 'Tech Committee', code: 'TECH', description: '', created_at: '', member_count: 5 },
    ]);
  });

  it('renders students list and Add Member button for admin', async () => {
    render(
      <ToastProvider>
        <StudentsPage currentUser={mockAdminUser} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Member registry')).toBeInTheDocument();
      expect(screen.getAllByText('زياد محمد').length).toBeGreaterThan(0);
    });

    const addBtn = screen.getByRole('button', { name: /add member/i });
    expect(addBtn).toBeInTheDocument();
  });

  it('opens Enroll New Member modal on clicking Add Member', async () => {
    render(
      <ToastProvider>
        <StudentsPage currentUser={mockAdminUser} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Member registry')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: /add member/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('Enroll New Member')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Mostafa Mahmoud')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('مثال: مصطفى محمود')).toBeInTheDocument();
  });

  it('submits new student and updates the list', async () => {
    const newStudent: Student = {
      id: 'std_2',
      student_code: 'ST-2026-999999',
      full_name: 'Mostafa Mahmoud',
      arabic_name: 'مصطفى محمود',
      email: 'mostafa@studentops.org',
      phone: '+20 111 222 3333',
      university: 'Faculty of Engineering',
      role: 'Member',
      status: 'ACTIVE',
      team_id: 'team_tech',
      created_at: new Date().toISOString(),
    };

    vi.mocked(api.createStudent).mockResolvedValue(newStudent);

    render(
      <ToastProvider>
        <StudentsPage currentUser={mockAdminUser} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Member registry')).toBeInTheDocument();
    });

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /add member/i }));

    // Fill inputs
    fireEvent.change(screen.getByPlaceholderText('e.g. Mostafa Mahmoud'), {
      target: { value: 'Mostafa Mahmoud' },
    });
    fireEvent.change(screen.getByPlaceholderText('مثال: مصطفى محمود'), {
      target: { value: 'مصطفى محمود' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. mostafa@studentops.org'), {
      target: { value: 'mostafa@studentops.org' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. +20 100 123 4567'), {
      target: { value: '+20 111 222 3333' },
    });

    // Click submit
    fireEvent.click(screen.getByRole('button', { name: /enroll member/i }));

    await waitFor(() => {
      expect(api.createStudent).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Mostafa Mahmoud',
          arabic_name: 'مصطفى محمود',
          email: 'mostafa@studentops.org',
          phone: '+20 111 222 3333',
        })
      );
      expect(screen.getAllByText('مصطفى محمود').length).toBeGreaterThan(0);
    });
  });
});

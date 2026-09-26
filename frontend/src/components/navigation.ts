import type React from 'react';
import {
  LayoutDashboard, Calendar, CheckSquare, ClipboardList, Users, Video,
  MessageSquareHeart, MessageCircleQuestion, Bot, MessageSquare, Bell,
  FileText, ShieldCheck,
} from 'lucide-react';
import type { UserRole } from '../types';

export type Tab =
  | 'dashboard'
  | 'chat'
  | 'attendance'
  | 'scoreboard'
  | 'calendar'
  | 'tasks'
  | 'task-reviews'
  | 'qna'
  | 'feedback'
  | 'reports'
  | 'students'
  | 'notifications'
  | 'audit'
  | 'whatsapp';

export type Role = UserRole;

const ALL: Role[] = [
  'region_hr_head', 'committee_hr_leader', 'committee_head',
  'committee_hr_member', 'committee_member', 'hr_admin', 'team_lead', 'member',
];
const STAFF: Role[] = [
  'region_hr_head', 'committee_hr_leader', 'committee_head',
  'committee_hr_member', 'hr_admin', 'team_lead',
];
const LEADERSHIP: Role[] = [
  'region_hr_head', 'committee_hr_leader', 'committee_head', 'hr_admin', 'team_lead',
];

export interface NavItem {
  id: Tab;
  label: string;
  icon: React.FC<{ className?: string }>;
  roles: Role[];
  /** Extra search terms so the header search finds pages by intent. */
  aliases?: string;
}

/*
 * Single source of truth for navigation. `App` uses `roles` to reject
 * unauthorised routes, and the header search queries the same list, so a page
 * can never be reachable by URL without also being listed.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard', label: 'Overview', icon: LayoutDashboard, roles: ALL,
    aliases: 'home dashboard summary',
  },
  {
    id: 'calendar', label: 'Schedule', icon: Calendar,
    roles: ALL, aliases: 'calendar sessions timetable',
  },
  {
    id: 'tasks', label: 'Tasks', icon: CheckSquare,
    roles: ALL, aliases: 'deliverables assignments sprints',
  },
  {
    id: 'task-reviews', label: 'Task reviews', icon: ClipboardList,
    roles: ['committee_head', 'hr_admin', 'team_lead'], aliases: 'grading submissions',
  },
  {
    id: 'attendance', label: 'Attendance', icon: Video,
    roles: ALL, aliases: 'meet presence absent sessions',
  },
  {
    id: 'students', label: 'Member registry', icon: Users,
    roles: STAFF, aliases: 'members people directory students',
  },
  {
    id: 'scoreboard', label: 'Evaluations', icon: ClipboardList,
    roles: STAFF, aliases: 'scores grading behaviour behaviour scores',
  },
  {
    id: 'feedback', label: 'Feedback', icon: MessageSquareHeart,
    roles: ['committee_member', 'member', 'committee_hr_leader', 'region_hr_head', 'hr_admin'],
    aliases: 'reviews comments',
  },
  {
    id: 'qna', label: 'Questions', icon: MessageCircleQuestion,
    roles: [...LEADERSHIP, 'committee_member', 'member', 'committee_hr_member'],
    aliases: 'qna ask committee',
  },
  {
    id: 'whatsapp', label: 'Messages', icon: MessageSquare,
    roles: STAFF, aliases: 'whatsapp inbox escalations follow ups',
  },
  {
    id: 'notifications', label: 'Reminders', icon: Bell,
    roles: ALL, aliases: 'notifications alerts',
  },
  {
    id: 'chat', label: 'Assistant', icon: Bot,
    roles: STAFF, aliases: 'ai agent assistant rea chat',
  },
  {
    id: 'reports', label: 'Reports', icon: FileText,
    roles: ['committee_hr_leader', 'region_hr_head', 'hr_admin'], aliases: 'executive analytics',
  },
  {
    id: 'audit', label: 'Audit log', icon: ShieldCheck,
    roles: ['region_hr_head', 'hr_admin'], aliases: 'activity history oversight',
  },
];

export const NAV_GROUPS: { label: string; ids: Tab[] }[] = [
  { label: 'Workspace', ids: ['dashboard', 'calendar', 'tasks', 'task-reviews'] },
  { label: 'People', ids: ['attendance', 'students', 'scoreboard', 'feedback', 'qna'] },
  { label: 'Communication', ids: ['whatsapp', 'notifications', 'chat'] },
  { label: 'Oversight', ids: ['reports', 'audit'] },
];

/**
 * Every declared item must appear in a group, otherwise it is declared but
 * never rendered. A nav item missing from `NAV_GROUPS` is silently unreachable
 * in the sidebar while still being routable, which is a real bug.
 */
const GROUPED = new Set(NAV_GROUPS.flatMap(group => group.ids));
const UNGROUPED = NAV_ITEMS.filter(item => !GROUPED.has(item.id)).map(item => item.id);
if (UNGROUPED.length > 0) {
  throw new Error(`navigation: items missing from NAV_GROUPS: ${UNGROUPED.join(', ')}`);
}

/** Items a role is allowed to see, in group order. */
export function visibleNavGroups(role: Role) {
  const allowed = NAV_ITEMS.filter(item => item.roles.includes(role));
  return NAV_GROUPS
    .map(group => ({
      label: group.label,
      items: group.ids.flatMap(id => allowed.filter(item => item.id === id)),
    }))
    .filter(group => group.items.length > 0);
}

/** True when the role may open this page. */
export function canAccessTab(role: Role, tab: Tab): boolean {
  return NAV_ITEMS.some(item => item.id === tab && item.roles.includes(role));
}

export function navItemFor(tab: Tab) {
  return NAV_ITEMS.find(item => item.id === tab);
}

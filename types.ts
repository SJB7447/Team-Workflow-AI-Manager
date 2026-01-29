
export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  assignee: string;
  role: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  progress: number;
  issue: string;
  attachmentName?: string;
  attachmentType?: 'image' | 'file';
  attachmentData?: string;
  createdAt: number;
}

export interface Requirement {
  id: string;
  title: string;
  category: 'requirement' | 'guideline' | 'reference';
  content: string;
  link?: string;
  attachmentName?: string;
  attachmentType?: 'image' | 'file';
  attachmentData?: string;
  createdAt: number;
}

export interface MeetingLog {
  id: string;
  title: string;
  date: string;
  attendees: string;
  content: string;
  attachmentName?: string;
  attachmentType?: 'image' | 'file';
  attachmentData?: string;
  createdAt: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
}

export interface AIProgressResult {
  percentage: number;
  reasoning: string;
}

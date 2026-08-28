import type { UserRole } from "./auth";

export interface MessageContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  position: string;
  branchId: string | null;
  branchName: string | null;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

export interface DirectMessage {
  id: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

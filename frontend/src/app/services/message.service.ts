import { api } from "./api";
import type { ApiSuccess } from "../types/auth";
import type { DirectMessage, MessageContact } from "../types/messaging";

export const messageService = {
  async contacts() {
    return (await api.get<ApiSuccess<{ contacts: MessageContact[] }>>("/messages/contacts")).data.data.contacts;
  },
  async conversation(userId: string) {
    return (await api.get<ApiSuccess<{ messages: DirectMessage[] }>>(`/messages/${userId}`)).data.data.messages;
  },
  async context(messageId: string) {
    return (await api.get<ApiSuccess<{ contactUserId: string }>>(`/messages/context/${messageId}`)).data.data.contactUserId;
  },
  async send(recipientUserId: string, body: string) {
    return (await api.post<ApiSuccess<{ message: DirectMessage }>>("/messages", { recipientUserId, body })).data.data.message;
  },
  async markConversationRead(userId: string) {
    await api.patch(`/messages/conversation/${userId}/read`);
  },
};

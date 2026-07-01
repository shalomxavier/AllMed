import type { IConversationRepository } from './interfaces/IConversationRepository';
import type { IMessageRepository } from './interfaces/IMessageRepository';
import type { IEnquiryRepository } from './interfaces/IEnquiryRepository';
import { FirestoreConversationRepository } from './implementations/FirestoreConversationRepository';
import { FirestoreMessageRepository } from './implementations/FirestoreMessageRepository';
import { FirestoreEnquiryRepository } from './implementations/FirestoreEnquiryRepository';

let conversationRepository: IConversationRepository | null = null;
let messageRepository: IMessageRepository | null = null;
let enquiryRepository: IEnquiryRepository | null = null;

export const getConversationRepository = (): IConversationRepository => {
  if (!conversationRepository) {
    conversationRepository = new FirestoreConversationRepository();
  }
  return conversationRepository;
};

export const getMessageRepository = (): IMessageRepository => {
  if (!messageRepository) {
    messageRepository = new FirestoreMessageRepository();
  }
  return messageRepository;
};

export const getEnquiryRepository = (): IEnquiryRepository => {
  if (!enquiryRepository) {
    enquiryRepository = new FirestoreEnquiryRepository();
  }
  return enquiryRepository;
};

// Reset repositories (useful for testing)
export const resetRepositories = (): void => {
  conversationRepository = null;
  messageRepository = null;
  enquiryRepository = null;
};

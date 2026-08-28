import { Router } from "express";
import { getConversation, getMessageContext, listMessageContacts, markConversationRead, sendMessage } from "../controllers/message.controller.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const messageRouter = Router();
messageRouter.use(authenticate);
messageRouter.get("/contacts", asyncHandler(listMessageContacts));
messageRouter.get("/context/:messageId", asyncHandler(getMessageContext));
messageRouter.patch("/conversation/:userId/read", asyncHandler(markConversationRead));
messageRouter.get("/:userId", asyncHandler(getConversation));
messageRouter.post("/", asyncHandler(sendMessage));

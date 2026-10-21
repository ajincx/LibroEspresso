import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DirectMessage } from "../../types/messaging";
import { canDeleteSentMessage, MessageContactsSkeleton, SentMessageDeleteButton, withoutDeletedMessage } from "./MessagesPanel";

const message=(id:string,senderUserId:string):DirectMessage=>({id,senderUserId,recipientUserId:"recipient",body:"Message",readAt:null,createdAt:"2026-10-02T00:00:00Z"});

describe("sent-message deletion UI",()=>{
  it("renders contact-shaped skeleton rows without a premature empty state",()=>{
    const markup=renderToStaticMarkup(React.createElement(MessageContactsSkeleton));
    expect(markup).toContain("data-message-contacts-skeleton");
    expect(markup).toContain('aria-label="Loading users"');
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).not.toContain("No users found");
  });

  it("shows the delete action only for the current user's own message",()=>{
    const mine=message("mine","current");
    const theirs=message("theirs","other");
    expect(canDeleteSentMessage(mine,"current")).toBe(true);
    expect(canDeleteSentMessage(theirs,"current")).toBe(false);
    expect(renderToStaticMarkup(React.createElement(SentMessageDeleteButton,{visible:true,onDelete:vi.fn()}))).toContain('aria-label="Delete sent message"');
    expect(renderToStaticMarkup(React.createElement(SentMessageDeleteButton,{visible:false,onDelete:vi.fn()}))).toBe("");
  });

  it("removes the confirmed message immediately without disturbing timestamps or other messages",()=>{
    const first=message("first","current");
    const second=message("second","other");
    expect(withoutDeletedMessage([first,second],first.id)).toEqual([second]);
    expect(second.createdAt).toBe("2026-10-02T00:00:00Z");
  });
});

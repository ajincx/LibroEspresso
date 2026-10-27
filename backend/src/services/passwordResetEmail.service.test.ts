import { describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({sendExternalEmail:vi.fn()}));
vi.mock("./emailTransport.service.js",()=>({emailDeliveryConfigured:()=>true,sendExternalEmail:mocks.sendExternalEmail}));
vi.mock("../config/env.js",()=>({env:{PASSWORD_RESET_URL_BASE:"https://libro-espresso.vercel.app/reset-password"}}));
vi.mock("../config/database.js",()=>({pool:{}}));
vi.mock("./auth.service.js",()=>({revokeAllUserSessions:vi.fn()}));

import { deliverResetEmail } from "./passwordReset.service.js";

describe("password reset SMTP delivery",()=>{
  it("awaits delivery and sends the raw token only in the HTTPS reset link",async()=>{
    mocks.sendExternalEmail.mockResolvedValueOnce(undefined);
    await deliverResetEmail("approved-test@example.com","raw-secret-token");
    expect(mocks.sendExternalEmail).toHaveBeenCalledWith(expect.objectContaining({
      to:"approved-test@example.com",
      subject:"Reset your Libro Espresso password",
      text:expect.stringContaining("https://libro-espresso.vercel.app/reset-password?token=raw-secret-token"),
    }));
  });
  it("rejects when SMTP delivery fails",async()=>{
    mocks.sendExternalEmail.mockRejectedValueOnce(Object.assign(new Error("delivery failed"),{code:"EAUTH"}));
    await expect(deliverResetEmail("approved-test@example.com","raw-secret-token")).rejects.toMatchObject({code:"EAUTH"});
  });
});

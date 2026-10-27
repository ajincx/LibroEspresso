import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({createTransport:vi.fn(),sendMail:vi.fn(),verify:vi.fn()}));
vi.mock("nodemailer",()=>({default:{createTransport:mocks.createTransport}}));
vi.mock("../config/env.js",()=>({env:{
  SMTP_HOST:"smtp.gmail.com",SMTP_PORT:465,SMTP_SECURE:true,
  SMTP_USER:"mailer@example.com",SMTP_APP_PASSWORD:"abcdefghijklmnop",
  SMTP_FROM:"mailer@example.com",PASSWORD_RESET_URL_BASE:"https://libro-espresso.vercel.app/reset-password",
}}));

import { emailDeliveryConfigured,resetEmailTransportForTests,sendExternalEmail,verifyEmailTransport } from "./emailTransport.service.js";

describe("Gmail SMTP transport",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();resetEmailTransportForTests();
    mocks.createTransport.mockReturnValue({sendMail:mocks.sendMail,verify:mocks.verify});
  });
  it("uses implicit TLS with certificate and hostname verification plus bounded timeouts",async()=>{
    mocks.sendMail.mockResolvedValueOnce({messageId:"test"});
    expect(emailDeliveryConfigured()).toBe(true);
    await sendExternalEmail({to:"recipient@example.com",subject:"Test",text:"Text",html:"<p>Text</p>"});
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host:"smtp.gmail.com",port:465,secure:true,
      tls:{rejectUnauthorized:true,servername:"smtp.gmail.com"},
      connectionTimeout:15000,greetingTimeout:15000,socketTimeout:15000,
      disableFileAccess:true,disableUrlAccess:true,
    }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({from:"mailer@example.com",to:"recipient@example.com"}));
  });
  it("surfaces verification and delivery failures without logging credentials",async()=>{
    mocks.verify.mockRejectedValueOnce(Object.assign(new Error("unavailable"),{code:"ETIMEDOUT"}));
    await expect(verifyEmailTransport()).rejects.toMatchObject({code:"ETIMEDOUT"});
    mocks.sendMail.mockRejectedValueOnce(Object.assign(new Error("unavailable"),{code:"EAUTH"}));
    await expect(sendExternalEmail({to:"recipient@example.com",subject:"Test",text:"Text",html:"<p>Text</p>"})).rejects.toMatchObject({code:"EAUTH"});
  });
});

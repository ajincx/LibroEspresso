import { describe,expect,it,vi } from "vitest";

vi.mock("../config/database.js",()=>({pool:{}}));
vi.mock("../config/env.js",()=>({env:{CLIENT_URL:"https://libro-espresso.vercel.app"}}));
vi.mock("./emailTransport.service.js",()=>({
  emailDeliveryConfigured:()=>true,
  sanitizeEmailDeliveryErrorCode:()=>"SMTP_DELIVERY_FAILED",
  sendExternalEmail:vi.fn(),
}));

import { buildPosImportReminderEmail } from "./posImportReminderEmail.service.js";

describe("POS import reminder email presentation",()=>{
  it("includes the actual branch, formatted business date, CTA, and plain-text fallback",()=>{
    const message=buildPosImportReminderEmail({
      recipientName:"Gulod Manager",
      branchName:"Gulod / Main Branch",
      businessDate:"2026-10-31",
      appUrl:"https://libro-espresso.vercel.app",
    });
    expect(message.subject).toBe("Reminder: Pending POS Sales Import – Gulod / Main Branch | Libro Espresso");
    expect(message.text).toContain("October 31, 2026");
    expect(message.text).toContain("Gulod / Main Branch");
    expect(message.text).toContain("Cost of Goods Sold (COGS)");
    expect(message.html).toContain(">Open Libro Espresso</a>");
    expect(message.html).toContain("This is an automated notification. Please do not reply.");
  });

  it("escapes database-provided recipient and branch names in HTML",()=>{
    const message=buildPosImportReminderEmail({recipientName:"<Manager>",branchName:"A & B",businessDate:"2026-10-31",appUrl:"https://example.com/?a=1&b=2"});
    expect(message.html).toContain("&lt;Manager&gt;");
    expect(message.html).toContain("A &amp; B");
    expect(message.html).toContain("a=1&amp;b=2");
  });
});

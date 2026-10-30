import { afterEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({requestPasswordReset:vi.fn()}));
vi.mock("../services/passwordReset.service.js",()=>({
  consumePasswordReset:vi.fn(),
  requestPasswordReset:mocks.requestPasswordReset,
}));

import { forgotPassword } from "./auth.controller.js";

describe("forgot password delivery diagnostics",()=>{
  afterEach(()=>vi.restoreAllMocks());

  it("logs only an allowed SMTP category and preserves the generic response",async()=>{
    const error=Object.assign(new Error("535 credentials and recipient@example.com"),{
      code:"EAUTH",
      response:"raw SMTP response",
      token:"raw-reset-token",
    });
    mocks.requestPasswordReset.mockRejectedValueOnce(error);
    const log=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const json=vi.fn();

    await forgotPassword(
      {body:{email:"recipient@example.com"},ip:"127.0.0.1",get:vi.fn()} as never,
      {json} as never,
      vi.fn(),
    );

    expect(log).toHaveBeenCalledWith("Password reset delivery failed","EAUTH");
    expect(log).not.toHaveBeenCalledWith(expect.anything(),error);
    expect(json).toHaveBeenCalledWith({
      success:true,
      data:{message:"If an active account uses that email, a password reset link will be sent."},
    });
  });

  it("does not expose unknown error details in logs or the response",async()=>{
    const error=Object.assign(new Error("recipient@example.com raw-reset-token"),{code:"EUNKNOWN"});
    mocks.requestPasswordReset.mockRejectedValueOnce(error);
    const log=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const json=vi.fn();

    await forgotPassword(
      {body:{email:"recipient@example.com"},ip:"127.0.0.1",get:vi.fn()} as never,
      {json} as never,
      vi.fn(),
    );

    expect(log).toHaveBeenCalledWith("Password reset delivery failed","SMTP_DELIVERY_FAILED");
    expect(JSON.stringify(log.mock.calls)).not.toContain("recipient@example.com");
    expect(JSON.stringify(log.mock.calls)).not.toContain("raw-reset-token");
    expect(JSON.stringify(json.mock.calls)).not.toContain("raw-reset-token");
  });
});

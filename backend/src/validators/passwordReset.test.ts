import {describe,expect,it} from "vitest";
import {forgotPasswordInput,resetPasswordInput} from "./passwordReset.js";
import {branchDeactivationInput,userDeactivationInput} from "./deactivation.js";

describe("password reset and deactivation validation",()=>{
  it("normalizes reset email and requires matching strong passwords",()=>{expect(forgotPasswordInput.parse({email:" User@Example.COM "}).email).toBe("user@example.com");expect(()=>resetPasswordInput.parse({token:"ab".repeat(32),password:"long-password",confirmPassword:"different-password"})).toThrow();});
  it("accepts only the approved account reasons and a descriptive Other reason",()=>{expect(userDeactivationInput.parse({reason:"Employee resigned."}).reason).toBe("Employee resigned.");expect(()=>userDeactivationInput.parse({reason:"Other: short"})).toThrow();expect(()=>userDeactivationInput.parse({reason:"Arbitrary"})).toThrow();});
  it("accepts only the approved branch reasons",()=>{expect(branchDeactivationInput.parse({reason:"Branch relocated."}).reason).toBe("Branch relocated.");expect(()=>branchDeactivationInput.parse({reason:"Employee resigned."})).toThrow();});
});

import { z } from "zod";

export const forgotPasswordInput=z.object({email:z.string().trim().transform(value=>value.toLocaleLowerCase("en-US")).pipe(z.string().email().max(255))});
export const resetPasswordInput=z.object({token:z.string().regex(/^[a-f0-9]{64}$/i,"Reset link is invalid"),password:z.string().min(10).max(128),confirmPassword:z.string().min(10).max(128)}).refine(value=>value.password===value.confirmPassword,{path:["confirmPassword"],message:"Passwords do not match"});

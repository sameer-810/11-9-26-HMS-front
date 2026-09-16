import { z } from "zod";

/** US-01: email or employee ID; the server tells them apart by "@". */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or employee ID")
    .max(254, "That is too long"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginForm = z.infer<typeof loginSchema>;

/** Minimum 10 characters, matching the server; no complexity rule by design (length over symbols). */
export const newPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "That is too long");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Type the new password again"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "These do not match",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "Your new password must be different",
    path: ["newPassword"],
  });

export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email")
    .email("Enter a valid email address"),
});

export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address"),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, "Type the new password again"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "These do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

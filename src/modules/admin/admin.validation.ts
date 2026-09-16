import { z } from "zod";
import { ROLES } from "@shared/permissions";

// client-side mirrors of user.validation.js; the server re-validates everything
// and its refusals (clashing employee ID, taken email) are shown as worded.
const phone = z
  .string()
  .trim()
  .regex(/^(\+?\d{1,3}[- ]?)?\d{10}$/, "Enter a valid 10-digit mobile number");

const roleValues = Object.values(ROLES) as [string, ...string[]];

const clinicalFields = {
  designation: z.string().trim().max(80, "At most 80 characters").optional(),
  registrationNumber: z
    .string()
    .trim()
    .max(40, "At most 40 characters")
    .optional(),
  specialization: z.string().trim().max(80, "At most 80 characters").optional(),
  qualifications: z
    .string()
    .trim()
    .max(160, "At most 160 characters")
    .optional(),
};

export const createUserSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .min(1, "Enter the employee ID")
    .max(24, "At most 24 characters"),
  firstName: z.string().trim().min(1, "Enter their first name").max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z
    .string()
    .trim()
    .min(1, "Enter their work email")
    .email("Enter a valid email address"),
  phone: z.union([phone, z.literal("")]).optional(),
  role: z.enum(roleValues, { message: "Choose a role" }),
  departmentId: z.string().optional(),
  ...clinicalFields,
});

export type CreateUserForm = z.infer<typeof createUserSchema>;

export const editUserSchema = z.object({
  firstName: z.string().trim().min(1, "Enter their first name").max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z
    .string()
    .trim()
    .min(1, "Enter their work email")
    .email("Enter a valid email address"),
  phone: z.union([phone, z.literal("")]).optional(),
  ...clinicalFields,
});

export type EditUserForm = z.infer<typeof editUserSchema>;

/** Roles that carry a clinical identity printed on prescriptions and charts. */
export const CLINICAL_ROLES: string[] = [ROLES.DOCTOR, ROLES.NURSE];

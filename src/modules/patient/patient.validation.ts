import { z } from "zod";

const phone = z
  .string()
  .trim()
  .regex(/^(\+?\d{1,3}[- ]?)?\d{10}$/, "Enter a 10-digit mobile number");

const optionalPhone = z.union([phone, z.literal("")]).optional();

/**
 * Registration. "Date of birth or age" is a form-level refine; many patients do not know their
 * date of birth, and forcing one fills the register with falsely precise 01-Jan dates.
 */
export const registerPatientSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter the patient's name").max(60),
    lastName: z.string().trim().max(60).optional(),

    dateOfBirth: z.string().trim().optional(),
    approximateAgeYears: z
      .union([z.coerce.number().int().min(0).max(130), z.literal("")])
      .optional(),

    gender: z.enum(["male", "female", "other"], { message: "Choose a gender" }),
    bloodGroup: z.string().optional(),

    mobile: phone,
    alternatePhone: optionalPhone,
    email: z
      .union([z.string().trim().email("Enter a valid email"), z.literal("")])
      .optional(),

    addressLine1: z.string().trim().max(120).optional(),
    city: z.string().trim().max(60).optional(),
    state: z.string().trim().max(60).optional(),
    pincode: z
      .union([
        z
          .string()
          .trim()
          .regex(/^\d{6}$/, "Enter a 6-digit PIN code"),
        z.literal(""),
      ])
      .optional(),

    emergencyName: z.string().trim().max(60).optional(),
    emergencyRelationship: z.string().trim().max(40).optional(),
    emergencyPhone: optionalPhone,

    abhaNumber: z
      .union([
        z
          .string()
          .trim()
          .regex(
            /^\d{2}-?\d{4}-?\d{4}-?\d{4}$/,
            "Enter a 14-digit ABHA number",
          ),
        z.literal(""),
      ])
      .optional(),

    isMlc: z.boolean().optional(),
  })
  .refine(
    (v) =>
      Boolean(v.dateOfBirth) ||
      (v.approximateAgeYears !== undefined && v.approximateAgeYears !== ""),
    {
      message: "Enter a date of birth, or an approximate age",
      path: ["approximateAgeYears"],
    },
  )
  .refine((v) => !v.dateOfBirth || !Number.isNaN(Date.parse(v.dateOfBirth)), {
    message: "Enter a date as YYYY-MM-DD",
    path: ["dateOfBirth"],
  })
  .refine((v) => !v.dateOfBirth || Date.parse(v.dateOfBirth) <= Date.now(), {
    message: "That date is in the future",
    path: ["dateOfBirth"],
  });

export type RegisterPatientForm = z.infer<typeof registerPatientSchema>;

export const allergySchema = z.object({
  substance: z.string().trim().min(1, "Name the substance").max(80),
  severity: z.enum(["mild", "moderate", "severe", "anaphylaxis"], {
    message: "Choose a severity",
  }),
  reaction: z.string().trim().max(200).optional(),
  category: z.enum(["drug", "food", "environmental", "other"]).optional(),
});

export type AllergyForm = z.infer<typeof allergySchema>;

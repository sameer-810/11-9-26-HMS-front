import React, { useState } from "react";
import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { ROLES, ROLE_LABELS, type Role } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  SectionHeader,
  Button,
  Select,
  Banner,
} from "@shared/ui";
import { ControlledTextField } from "@shared/form/ControlledTextField";
import { apiErrorMessage } from "@api/apiClient";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import { useCreateUser } from "@modules/admin/hooks/useAdmin";
import { CredentialPanel } from "@modules/admin/components/CredentialPanel";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import {
  CLINICAL_ROLES,
  createUserSchema,
  type CreateUserForm,
} from "@modules/admin/admin.validation";
import { ROLE_SUMMARIES, type IssuedCredential } from "@modules/admin/types";

const ROLE_OPTIONS = (Object.values(ROLES) as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABELS[r],
  sublabel: ROLE_SUMMARIES[r],
}));

const EMPTY: CreateUserForm = {
  employeeId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: undefined as never,
  departmentId: "",
  designation: "",
  registrationNumber: "",
  specialization: "",
  qualifications: "",
};

/**
 * Create an account at a role. No password field: the server issues a temporary one, shown once.
 * Permissions start at role defaults; per-person changes happen on the account screen.
 */
export default function CreateUserScreen() {
  const navigation = useNavigation<any>();
  const create = useCreateUser();
  const { data: departments = [] } = useDepartments();
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [icu, setIcu] = useState(false);

  const { control, handleSubmit, reset } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    mode: "onTouched",
    defaultValues: EMPTY,
  });
  const role = useWatch({ control, name: "role" });
  const clinical = CLINICAL_ROLES.includes(role ?? "");

  const submit = handleSubmit((v) => {
    create.mutate(
      {
        employeeId: v.employeeId,
        firstName: v.firstName,
        lastName: v.lastName || undefined,
        email: v.email,
        phone: v.phone || undefined,
        role: v.role as Role,
        designation: v.designation || undefined,
        departmentId: v.departmentId || undefined,
        // clinical identity only for the roles it is printed for
        ...(clinical
          ? {
              registrationNumber: v.registrationNumber || undefined,
              specialization: v.specialization || undefined,
              qualifications: v.qualifications || undefined,
              icuAuthorized: icu,
            }
          : {}),
      },
      { onSuccess: setIssued },
    );
  });

  const startAgain = () => {
    setIssued(null);
    setIcu(false);
    create.reset();
    reset(EMPTY);
  };

  if (issued) {
    return (
      <Screen
        overline="Users"
        title="Account created"
        subtitle={`${issued.user.fullName} · ${issued.user.roleLabel} · ${issued.user.employeeId}`}
        testID="user-created"
      >
        <VStack gap={14} style={{ maxWidth: 620 }}>
          <Banner
            tone="success"
            message={`${issued.user.fullName} can sign in now, with the role's default access.`}
          />
          <CredentialPanel
            kind="created"
            name={issued.user.firstName}
            employeeId={issued.user.employeeId}
            email={issued.user.email}
            password={issued.temporaryPassword}
          />
          <HStack gap={8} wrap>
            <Button
              label="Open their account"
              fullWidth={false}
              onPress={() => navigation.replace("UserDetail", { userId: issued.user.id })}
              testID="user-created-open"
            />
            <Button
              label="Add another user"
              variant="secondary"
              fullWidth={false}
              onPress={startAgain}
              testID="user-create-another"
            />
            <Button
              label="Back to users"
              variant="ghost"
              fullWidth={false}
              onPress={() => navigation.navigate("UsersList")}
              testID="user-created-back"
            />
          </HStack>
        </VStack>
      </Screen>
    );
  }

  const departmentOptions = [
    { value: "", label: "No department" },
    ...departments.map((d) => ({ value: d.id, label: d.name, sublabel: d.code })),
  ];

  return (
    <Screen
      overline="Users"
      title="Add a user"
      subtitle="The account is active straight away with a temporary password."
      testID="user-create-screen"
      right={
        <Button
          label="Cancel"
          size="sm"
          variant="ghost"
          fullWidth={false}
          onPress={() => navigation.goBack()}
          testID="user-create-cancel"
        />
      }
    >
      <VStack gap={14} style={{ maxWidth: 760 }}>
        {create.isError ? (
          <View testID="user-create-error">
            <Banner tone="danger" message={apiErrorMessage(create.error, "Could not create the account")} />
          </View>
        ) : null}

        <Card>
          <SectionHeader title="Who they are" />
          <VStack gap={14}>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="employeeId"
                  label="Employee ID"
                  required
                  autoCapitalize="characters"
                  hint="Unique in this hospital."
                  testID="user-employeeId"
                />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="designation"
                  label="Designation"
                  placeholder="Staff Nurse, Senior Consultant"
                  hint="A job title for display. It grants nothing."
                  testID="user-designation"
                />
              </View>
            </HStack>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="firstName"
                  label="First name"
                  required
                  testID="user-firstName"
                />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField control={control} name="lastName" label="Last name" testID="user-lastName" />
              </View>
            </HStack>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 240 }}>
                <ControlledTextField
                  control={control}
                  name="email"
                  label="Work email"
                  required
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="off"
                  hint="They sign in with this."
                  testID="user-email"
                />
              </View>
              <View style={{ flex: 1, minWidth: 200 }}>
                <ControlledTextField
                  control={control}
                  name="phone"
                  label="Mobile"
                  keyboardType="phone-pad"
                  testID="user-phone"
                />
              </View>
            </HStack>
          </VStack>
        </Card>

        <Card>
          <SectionHeader
            title="What they can reach"
            subtitle="The role decides the menu, the dashboard and every permission they start with."
          />
          <VStack gap={14}>
            <HStack gap={12} wrap>
              <View style={{ flex: 1, minWidth: 240 }} testID="user-role">
                <Controller
                  control={control}
                  name="role"
                  render={({ field, fieldState }) => (
                    <Select
                      label="Role"
                      required
                      value={field.value ?? null}
                      options={ROLE_OPTIONS}
                      placeholder="Choose a role"
                      error={fieldState.error?.message}
                      onChange={(v) => field.onChange(v)}
                    />
                  )}
                />
              </View>
              <View style={{ flex: 1, minWidth: 240 }} testID="user-department">
                <Controller
                  control={control}
                  name="departmentId"
                  render={({ field }) => (
                    <Select
                      label="Department"
                      value={field.value ?? ""}
                      options={departmentOptions}
                      placeholder="No department"
                      hint="Doctors are offered for booking under their department."
                      onChange={(v) => field.onChange(v)}
                    />
                  )}
                />
              </View>
            </HStack>
            {role ? (
              <Text variant="caption" tone="tertiary" testID="user-role-summary">
                {ROLE_SUMMARIES[role as Role]}
              </Text>
            ) : null}
          </VStack>
        </Card>

        {clinical ? (
          <Card testID="user-clinical">
            <SectionHeader
              title="Clinical identity"
              subtitle="Printed on prescriptions and charts. Can be completed later."
            />
            <VStack gap={14}>
              <HStack gap={12} wrap>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <ControlledTextField
                    control={control}
                    name="registrationNumber"
                    label="Council registration number"
                    testID="user-registrationNumber"
                  />
                </View>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <ControlledTextField
                    control={control}
                    name="specialization"
                    label="Specialisation"
                    testID="user-specialization"
                  />
                </View>
              </HStack>
              <ControlledTextField
                control={control}
                name="qualifications"
                label="Qualifications"
                placeholder="MBBS, MD (Medicine)"
                testID="user-qualifications"
              />
              <ToggleRow
                label="ICU staff"
                description="Needed, together with the ICU permission, to open the ICU workspace."
                checked={icu}
                onChange={setIcu}
                testID="user-icuAuthorized"
              />
            </VStack>
          </Card>
        ) : null}

        <Button
          label="Create account"
          onPress={submit}
          loading={create.isPending}
          testID="user-create-submit"
        />
      </VStack>
    </Screen>
  );
}

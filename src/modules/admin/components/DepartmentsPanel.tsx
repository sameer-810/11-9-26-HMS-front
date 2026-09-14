import React, { useState } from "react";
import { View } from "react-native";
import { Building2, Plus } from "lucide-react-native";

import {
  Card,
  SectionHeader,
  VStack,
  HStack,
  Text,
  TextField,
  SearchInput,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  StatusChip,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { formatRupees } from "@shared/format";
import {
  useAdminDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useSetDepartmentActive,
} from "@modules/admin/hooks/useAdmin";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import type { Department, DepartmentBody } from "@modules/admin/types";

const CODE = /^[A-Z0-9-]{2,10}$/;

/**
 * Departments.
 *
 * "Remove" in this API is deactivation, and it is refused while active staff or
 * wards still point at the department (DEPARTMENT_IN_USE). The refusal names
 * what is in the way, and that message is shown as the server words it — it is
 * the instruction the administrator needs.
 */
export function DepartmentsPanel() {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const { data, isLoading, isError, error, refetch } = useAdminDepartments({
    search: debounced.trim() || undefined,
  });
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const setActive = useSetDepartmentActive();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Department | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const rows = data?.data ?? [];

  const clearMessages = () => {
    setNotice(null);
    setFailure(null);
  };

  const toggleActive = (d: Department, active: boolean) => {
    clearMessages();
    setActive.mutate(
      { id: d.id, active },
      {
        onSuccess: () =>
          setNotice(active ? `${d.name} is active again.` : `${d.name} is deactivated and no longer offered for booking.`),
        onError: (e) => setFailure(apiErrorMessage(e, `Could not change ${d.name}`)),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <VStack gap={12} testID="departments-panel">
      <HStack gap={8} align="center" wrap>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Department name or code" style={{ flex: 1, minWidth: 220 }} testID="department-search" />
        {!creating ? (
          <Button
            label="Add department"
            size="sm"
            fullWidth={false}
            icon={<Plus size={15} color="#FFFFFF" />}
            onPress={() => {
              clearMessages();
              create.reset();
              setCreating(true);
            }}
            testID="department-create-open"
          />
        ) : null}
      </HStack>

      {failure ? (
        <View testID="department-error">
          <Banner tone="danger" message={failure} onDismiss={() => setFailure(null)} />
        </View>
      ) : null}
      {notice ? (
        <View testID="department-notice">
          <Banner tone="success" message={notice} />
        </View>
      ) : null}

      {creating ? (
        <Card testID="department-create">
          <SectionHeader title="New department" />
          <DepartmentForm
            prefix="department-create"
            submitLabel="Add department"
            loading={create.isPending}
            error={create.isError ? apiErrorMessage(create.error, "Could not add the department") : null}
            onCancel={() => setCreating(false)}
            onSubmit={(body) =>
              create.mutate(body as DepartmentBody, {
                onSuccess: (d) => {
                  setCreating(false);
                  setNotice(`Department "${d.name}" (${d.code}) added.`);
                },
              })
            }
          />
        </Card>
      ) : null}

      {isLoading ? (
        <VStack gap={8}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </VStack>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={debounced ? "No department matches" : "No departments yet"}
          message="Departments sort doctors for booking and group wards and staff."
        />
      ) : (
        <VStack gap={8}>
          {rows.map((d) =>
            editing === d.id ? (
              <Card key={d.id} testID={`department-edit-${d.code}`}>
                <SectionHeader title={`Edit ${d.name}`} />
                <DepartmentForm
                  prefix="department-edit"
                  initial={d}
                  submitLabel="Save department"
                  loading={update.isPending}
                  error={update.isError ? apiErrorMessage(update.error, "Could not save the department") : null}
                  onCancel={() => setEditing(null)}
                  onSubmit={(body) => {
                    if (Object.keys(body).length === 0) {
                      setEditing(null);
                      return;
                    }
                    update.mutate(
                      { id: d.id, body },
                      {
                        onSuccess: (saved) => {
                          setEditing(null);
                          setNotice(`${saved.name} saved.`);
                        },
                      },
                    );
                  }}
                />
              </Card>
            ) : (
              <Card key={d.id} compact testID={`department-row-${d.code}`}>
                <HStack gap={12} align="center" wrap>
                  <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
                    <HStack gap={8} align="center" wrap>
                      <Text variant="label-lg">{d.name}</Text>
                      <Text variant="caption" tone="tertiary">
                        {d.code}
                      </Text>
                      <StatusChip status={d.isActive ? "active" : "inactive"} size="sm" />
                    </HStack>
                    <Text variant="body-sm" tone="secondary">
                      {d.isClinical ? "Clinical" : "Non-clinical"}
                      {d.isClinical ? ` · consultation ${formatRupees(d.consultationFee)}` : ""}
                      {d.opdTimings ? ` · ${d.opdTimings}` : ""}
                    </Text>
                    {d.description ? (
                      <Text variant="caption" tone="tertiary" numberOfLines={2}>
                        {d.description}
                      </Text>
                    ) : null}
                  </VStack>
                  <HStack gap={6}>
                    <Button
                      label="Edit"
                      size="xs"
                      variant="secondary"
                      fullWidth={false}
                      onPress={() => {
                        clearMessages();
                        update.reset();
                        setEditing(d.id);
                      }}
                      testID={`department-edit-open-${d.code}`}
                    />
                    {d.isActive ? (
                      <Button
                        label="Deactivate"
                        size="xs"
                        variant="ghost"
                        fullWidth={false}
                        onPress={() => setConfirm(d)}
                        testID={`department-deactivate-${d.code}`}
                      />
                    ) : (
                      <Button
                        label="Activate"
                        size="xs"
                        variant="ghost"
                        fullWidth={false}
                        loading={setActive.isPending && setActive.variables?.id === d.id}
                        onPress={() => toggleActive(d, true)}
                        testID={`department-activate-${d.code}`}
                      />
                    )}
                  </HStack>
                </HStack>
              </Card>
            ),
          )}
        </VStack>
      )}

      <ConfirmDialog
        visible={confirm !== null}
        title={`Deactivate ${confirm?.name ?? "this department"}?`}
        message="It stops appearing in booking and admission pickers. Anyone or any ward still attached must be moved first, or the change is refused."
        confirmLabel="Yes, deactivate"
        destructive
        loading={setActive.isPending}
        onConfirm={() => confirm && toggleActive(confirm, false)}
        onCancel={() => setConfirm(null)}
      />
    </VStack>
  );
}

interface FormProps {
  prefix: "department-create" | "department-edit";
  initial?: Department;
  submitLabel: string;
  loading: boolean;
  error: string | null;
  onSubmit: (body: Partial<DepartmentBody>) => void;
  onCancel: () => void;
}

/** Create and edit share one form. Edit submits only what changed. */
function DepartmentForm({ prefix, initial, submitLabel, loading, error, onSubmit, onCancel }: FormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [fee, setFee] = useState(initial ? String(initial.consultationFee) : "");
  const [timings, setTimings] = useState(initial?.opdTimings ?? "");
  const [clinical, setClinical] = useState(initial?.isClinical ?? true);
  const [attempted, setAttempted] = useState(false);

  const feeValue = fee.trim() === "" ? 0 : Number(fee);
  const errors = {
    name: name.trim().length < 2 ? "At least 2 characters" : undefined,
    code: !CODE.test(code.trim().toUpperCase()) ? "2–10 letters, digits or hyphens" : undefined,
    fee: !Number.isFinite(feeValue) || feeValue < 0 || feeValue > 1_000_000 ? "Between 0 and 10,00,000" : undefined,
    description: description.trim().length > 300 ? "At most 300 characters" : undefined,
    timings: timings.trim().length > 200 ? "At most 200 characters" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const next: DepartmentBody = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim(),
      isClinical: clinical,
      consultationFee: feeValue,
      opdTimings: timings.trim(),
    };
    if (!initial) {
      onSubmit(next);
      return;
    }
    const patch: Partial<DepartmentBody> = {};
    if (next.name !== initial.name) patch.name = next.name;
    if (next.code !== initial.code) patch.code = next.code;
    if (next.description !== initial.description) patch.description = next.description;
    if (next.isClinical !== initial.isClinical) patch.isClinical = next.isClinical;
    if (next.consultationFee !== initial.consultationFee) patch.consultationFee = next.consultationFee;
    if (next.opdTimings !== initial.opdTimings) patch.opdTimings = next.opdTimings;
    onSubmit(patch);
  };

  const show = (e?: string) => (attempted ? e : undefined);

  return (
    <VStack gap={12}>
      {error ? (
        <View testID={`${prefix}-error`}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}
      <HStack gap={12} wrap>
        <TextField label="Name" required value={name} onChangeText={setName} error={show(errors.name)} containerStyle={{ flex: 2, minWidth: 220 }} testID={`${prefix}-name`} />
        <TextField
          label="Code"
          required
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={10}
          error={show(errors.code)}
          hint={initial ? "Changing it does not rewrite numbers already issued." : "Used in identifiers and on slips."}
          containerStyle={{ flex: 1, minWidth: 160 }}
          testID={`${prefix}-code`}
        />
      </HStack>
      <TextField label="Description" value={description} onChangeText={setDescription} error={show(errors.description)} testID={`${prefix}-description`} />
      <ToggleRow
        label="Clinical department"
        description="Clinical departments take patients and appear when booking and admitting. Non-clinical ones exist for staffing and stock."
        checked={clinical}
        onChange={setClinical}
        testID={`${prefix}-clinical`}
      />
      {clinical ? (
        <HStack gap={12} wrap>
          <TextField
            label="Consultation fee"
            numericField
            suffix="₹"
            value={fee}
            onChangeText={setFee}
            error={show(errors.fee)}
            hint="The default for this department's doctors. Billing reads it."
            containerStyle={{ flex: 1, minWidth: 180 }}
            testID={`${prefix}-fee`}
          />
          <TextField
            label="OPD timings"
            placeholder="Mon–Sat, 9 am – 1 pm"
            value={timings}
            onChangeText={setTimings}
            error={show(errors.timings)}
            containerStyle={{ flex: 2, minWidth: 220 }}
            testID={`${prefix}-timings`}
          />
        </HStack>
      ) : null}
      <HStack gap={8} wrap>
        <Button label={submitLabel} fullWidth={false} loading={loading} onPress={submit} testID={`${prefix}-submit`} />
        <Button label="Cancel" variant="ghost" fullWidth={false} onPress={onCancel} testID={`${prefix}-cancel`} />
      </HStack>
    </VStack>
  );
}

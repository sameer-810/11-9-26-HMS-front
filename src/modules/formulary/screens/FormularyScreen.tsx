import React, { useState } from "react";
import { View } from "react-native";
import { Pill, Plus } from "lucide-react-native";

import {
  Screen,
  Card,
  SectionHeader,
  VStack,
  HStack,
  Text,
  TextField,
  SearchInput,
  Select,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  StatusChip,
  ConfirmDialog,
  Pagination,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useDebouncedValue } from "@shared/hooks/useDebouncedValue";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import { ListInput } from "@modules/formulary/components/ListInput";
import {
  useCreateMedicine,
  useFormulary,
  useUpdateMedicine,
} from "@modules/formulary/hooks/useFormulary";
import {
  FORM_LABELS,
  ROUTE_LABELS,
  SCHEDULE_LABELS,
  type DrugSchedule,
  type FormularyMedicine,
  type MedicineBody,
  type MedicineForm,
  type MedicinePatch,
  type MedicineRoute,
} from "@modules/formulary/types";

const LIMIT = 20;

/** The same choices the prescribing screen offers. */
const FREQUENCY_OPTIONS = [
  { value: "", label: "No default" },
  { value: "1-0-0", label: "1-0-0", sublabel: "Morning only" },
  { value: "0-0-1", label: "0-0-1", sublabel: "Night only" },
  { value: "1-0-1", label: "1-0-1", sublabel: "Morning and night" },
  { value: "1-1-1", label: "1-1-1", sublabel: "Three times a day" },
  { value: "1-1-1-1", label: "1-1-1-1", sublabel: "Four times a day" },
  { value: "SOS", label: "SOS", sublabel: "As needed" },
];

const FORM_OPTIONS = (Object.keys(FORM_LABELS) as MedicineForm[]).map((f) => ({
  value: f,
  label: FORM_LABELS[f],
}));
const ROUTE_OPTIONS = (Object.keys(ROUTE_LABELS) as MedicineRoute[]).map(
  (r) => ({ value: r, label: ROUTE_LABELS[r] }),
);
const SCHEDULE_OPTIONS = (Object.keys(SCHEDULE_LABELS) as DrugSchedule[]).map(
  (s) => ({
    value: s,
    label: SCHEDULE_LABELS[s],
    sublabel:
      s === "H1" || s === "X"
        ? "Carries pharmacy register obligations"
        : undefined,
  }),
);

function duplicateMessage(err: unknown, fallback: string) {
  return apiErrorCode(err) === "MEDICINE_EXISTS"
    ? "A medicine with this name, strength and form is already in the formulary. If it has been retired, turn on Show retired and allow prescribing it again."
    : apiErrorMessage(err, fallback);
}

/**
 * The hospital formulary: what doctors can prescribe. Retiring hides a medicine from
 * prescribing only; past prescriptions and stock keep it. Prices live on stock items.
 */
export default function FormularyScreen() {
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search, 300);

  const { data, isLoading, isError, error, refetch, isRefetching } =
    useFormulary({
      search: debounced.trim() || undefined,
      includeInactive: showRetired,
      page,
      limit: LIMIT,
    });
  const update = useUpdateMedicine();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<FormularyMedicine | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const rows = data?.data ?? [];

  const clearMessages = () => {
    setNotice(null);
    setFailure(null);
  };

  const setActive = (m: FormularyMedicine, active: boolean) => {
    clearMessages();
    update.mutate(
      { id: m.id, body: { isActive: active } },
      {
        onSuccess: () =>
          setNotice(
            active
              ? `${m.label} can be prescribed again.`
              : `${m.label} is retired. Doctors no longer find it when prescribing; past prescriptions are unchanged.`,
          ),
        onError: (e) =>
          setFailure(apiErrorMessage(e, `Could not change ${m.label}`)),
        onSettled: () => setRetiring(null),
      },
    );
  };

  return (
    <Screen
      overline="Pharmacy"
      title="Formulary"
      subtitle="The medicines doctors can prescribe. Prices and batches live on stock items."
      refreshing={isRefetching}
      onRefresh={refetch}
      testID="formulary-screen"
      right={
        !creating ? (
          <Button
            label="Add medicine"
            size="sm"
            fullWidth={false}
            icon={<Plus size={15} color="#FFFFFF" />}
            onPress={() => {
              clearMessages();
              setCreating(true);
            }}
            testID="formulary-create-open"
          />
        ) : null
      }
    >
      <VStack gap={12}>
        <HStack gap={12} align="center" wrap>
          <SearchInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Brand, generic name or ingredient"
            style={{ flex: 1, minWidth: 240 }}
            testID="formulary-search"
          />
          <View style={{ minWidth: 200 }}>
            <ToggleRow
              label="Show retired"
              description="Medicines no longer offered when prescribing."
              checked={showRetired}
              onChange={(v) => {
                setShowRetired(v);
                setPage(1);
              }}
              testID="formulary-show-retired"
            />
          </View>
        </HStack>

        {failure ? (
          <View testID="formulary-error">
            <Banner
              tone="danger"
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}
        {notice ? (
          <View testID="formulary-notice">
            <Banner tone="success" message={notice} />
          </View>
        ) : null}

        {creating ? (
          <Card testID="formulary-create">
            <SectionHeader
              title="New medicine"
              subtitle="Doctors can prescribe it as soon as it is saved."
            />
            <MedicineFormFields
              prefix="formulary-create"
              submitLabel="Add medicine"
              onCancel={() => setCreating(false)}
              onDone={(m) => {
                setCreating(false);
                setNotice(`${m.label} added. Doctors can prescribe it now.`);
              }}
            />
          </Card>
        ) : null}

        {isLoading ? (
          <VStack gap={8}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Pill}
            title={debounced ? "No medicine matches" : "The formulary is empty"}
            message={
              debounced && !showRetired
                ? "Try another name, or turn on Show retired."
                : "Add the medicines this hospital stocks so doctors can prescribe them."
            }
          />
        ) : (
          <VStack gap={8} testID="formulary-rows">
            {rows.map((m) =>
              editing === m.id ? (
                <Card key={m.id} testID={`medicine-edit-${m.id}`}>
                  <SectionHeader title={`Edit ${m.label}`} />
                  <MedicineFormFields
                    prefix="formulary-edit"
                    initial={m}
                    submitLabel="Save medicine"
                    onCancel={() => setEditing(null)}
                    onDone={(saved) => {
                      setEditing(null);
                      setNotice(`${saved.label} saved.`);
                    }}
                  />
                </Card>
              ) : (
                <MedicineRow
                  key={m.id}
                  medicine={m}
                  restoring={update.isPending && update.variables?.id === m.id}
                  onEdit={() => {
                    clearMessages();
                    setEditing(m.id);
                  }}
                  onRetire={() => setRetiring(m)}
                  onRestore={() => setActive(m, true)}
                />
              ),
            )}
          </VStack>
        )}

        {data && data.meta.pages > 1 ? (
          <Pagination
            page={page}
            totalPages={data.meta.pages}
            total={data.meta.total}
            limit={LIMIT}
            onPageChange={setPage}
            label="medicines"
          />
        ) : null}
      </VStack>

      <ConfirmDialog
        visible={retiring !== null}
        title={`Stop prescribing ${retiring?.label ?? "this medicine"}?`}
        message="Doctors will no longer find it when prescribing. Past prescriptions, dispensing records and stock are not affected, and you can allow it again at any time."
        confirmLabel="Yes, stop prescribing"
        destructive
        loading={update.isPending}
        onConfirm={() => retiring && setActive(retiring, false)}
        onCancel={() => setRetiring(null)}
      />
    </Screen>
  );
}

function MedicineRow({
  medicine: m,
  restoring,
  onEdit,
  onRetire,
  onRestore,
}: {
  medicine: FormularyMedicine;
  restoring: boolean;
  onEdit: () => void;
  onRetire: () => void;
  onRestore: () => void;
}) {
  const defaults = [
    m.defaultDose,
    m.defaultFrequency,
    m.defaultDurationDays
      ? `${m.defaultDurationDays} day${m.defaultDurationDays === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean);

  return (
    <Card
      compact
      testID={`medicine-row-${m.id}`}
      accessibilityLabel={`${m.label}${m.isActive ? "" : ", retired"}`}
    >
      <HStack gap={12} align="center" wrap>
        <VStack gap={2} style={{ flex: 1, minWidth: 240 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-lg" tone={m.isActive ? "primary" : "tertiary"}>
              {m.label}
            </Text>
            {!m.isActive ? <StatusChip status="retired" size="sm" /> : null}
            {m.schedule ? (
              <Text variant="caption" tone="warning">
                {SCHEDULE_LABELS[m.schedule]}
              </Text>
            ) : null}
            {m.isNarcotic ? (
              <Text variant="caption" tone="danger">
                Narcotic
              </Text>
            ) : null}
          </HStack>
          <Text variant="body-sm" tone="secondary">
            {[m.genericName, ROUTE_LABELS[m.route], m.drugClass]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          <Text variant="caption" tone="tertiary">
            Ingredients: {m.ingredients.join(", ") || "none listed"}
            {defaults.length ? ` · Default ${defaults.join(", ")}` : ""}
          </Text>
          {m.cautionNote ? (
            <Text variant="caption" tone="warning" numberOfLines={2}>
              {m.cautionNote}
            </Text>
          ) : null}
        </VStack>
        {m.isActive ? (
          <HStack gap={6}>
            <Button
              label="Edit"
              size="xs"
              variant="secondary"
              fullWidth={false}
              accessibilityHint={`Edit ${m.label}`}
              onPress={onEdit}
              testID={`medicine-edit-open-${m.id}`}
            />
            <Button
              label="Stop prescribing"
              size="xs"
              variant="ghost"
              fullWidth={false}
              accessibilityHint={`Retire ${m.label} from prescribing`}
              onPress={onRetire}
              testID={`medicine-retire-${m.id}`}
            />
          </HStack>
        ) : (
          <Button
            label="Allow prescribing again"
            size="xs"
            variant="ghost"
            fullWidth={false}
            loading={restoring}
            accessibilityHint={`Return ${m.label} to prescribing`}
            onPress={onRestore}
            testID={`medicine-restore-${m.id}`}
          />
        )}
      </HStack>
    </Card>
  );
}

interface FormProps {
  prefix: "formulary-create" | "formulary-edit";
  initial?: FormularyMedicine;
  submitLabel: string;
  onCancel: () => void;
  onDone: (m: FormularyMedicine) => void;
}

const sameList = (a: string[], b: string[]) => a.join("\n") === b.join("\n");

/** Create and edit share one form; edit sends only what changed. */
function MedicineFormFields({
  prefix,
  initial,
  submitLabel,
  onCancel,
  onDone,
}: FormProps) {
  const create = useCreateMedicine();
  const update = useUpdateMedicine();
  const mutation = initial ? update : create;

  const [name, setName] = useState(initial?.name ?? "");
  const [genericName, setGenericName] = useState(initial?.genericName ?? "");
  const [ingredients, setIngredients] = useState<string[]>(
    initial?.ingredients ?? [],
  );
  const [allergyGroups, setAllergyGroups] = useState<string[]>(
    initial?.allergyGroups ?? [],
  );
  const [form, setForm] = useState<MedicineForm>(initial?.form ?? "tablet");
  const [strength, setStrength] = useState(initial?.strength ?? "");
  const [route, setRoute] = useState<MedicineRoute>(initial?.route ?? "oral");
  const [drugClass, setDrugClass] = useState(initial?.drugClass ?? "");
  const [atcCode, setAtcCode] = useState(initial?.atcCode ?? "");
  const [schedule, setSchedule] = useState<DrugSchedule>(
    initial?.schedule ?? "",
  );
  const [isNarcotic, setIsNarcotic] = useState(initial?.isNarcotic ?? false);
  const [defaultDose, setDefaultDose] = useState(initial?.defaultDose ?? "");
  const [defaultFrequency, setDefaultFrequency] = useState(
    initial?.defaultFrequency ?? "",
  );
  const [duration, setDuration] = useState(
    initial?.defaultDurationDays ? String(initial.defaultDurationDays) : "",
  );
  const [cautionNote, setCautionNote] = useState(initial?.cautionNote ?? "");
  const [attempted, setAttempted] = useState(false);

  const durationValue = duration.trim() === "" ? null : Number(duration);
  const errors = {
    name:
      name.trim().length < 1 || name.trim().length > 120
        ? "Between 1 and 120 characters"
        : undefined,
    genericName:
      genericName.trim().length > 160 ? "At most 160 characters" : undefined,
    ingredients:
      ingredients.length === 0 ? "List at least one ingredient" : undefined,
    strength: strength.trim().length > 60 ? "At most 60 characters" : undefined,
    drugClass:
      drugClass.trim().length > 80 ? "At most 80 characters" : undefined,
    atcCode: atcCode.trim().length > 20 ? "At most 20 characters" : undefined,
    defaultDose:
      defaultDose.trim().length > 60 ? "At most 60 characters" : undefined,
    duration:
      durationValue !== null &&
      (!/^\d+$/.test(duration.trim()) ||
        durationValue < 1 ||
        durationValue > 365)
        ? "Between 1 and 365 days"
        : undefined,
    cautionNote:
      cautionNote.trim().length > 300 ? "At most 300 characters" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const next: Required<MedicineBody> = {
      name: name.trim(),
      genericName: genericName.trim(),
      ingredients,
      allergyGroups,
      form,
      strength: strength.trim(),
      route,
      drugClass: drugClass.trim(),
      atcCode: atcCode.trim().toUpperCase(),
      schedule,
      isNarcotic,
      defaultDose: defaultDose.trim(),
      defaultFrequency,
      defaultDurationDays: durationValue,
      cautionNote: cautionNote.trim(),
    };
    if (!initial) {
      create.mutate(next, { onSuccess: onDone });
      return;
    }
    const patch: MedicinePatch = {};
    for (const key of Object.keys(next) as (keyof MedicineBody)[]) {
      const before = initial[key];
      const after = next[key];
      const same =
        Array.isArray(before) && Array.isArray(after)
          ? sameList(before, after)
          : before === after;
      if (!same) Object.assign(patch, { [key]: after });
    }
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: initial.id, body: patch }, { onSuccess: onDone });
  };

  return (
    <VStack gap={12}>
      {mutation.isError ? (
        <View testID={`${prefix}-error`}>
          <Banner
            tone="danger"
            message={duplicateMessage(
              mutation.error,
              initial
                ? "Could not save the medicine"
                : "Could not add the medicine",
            )}
          />
        </View>
      ) : null}

      <HStack gap={12} wrap>
        <TextField
          label="Brand name"
          required
          placeholder="Amoxil"
          value={name}
          onChangeText={setName}
          error={show(errors.name)}
          containerStyle={{ flex: 1, minWidth: 220 }}
          testID={`${prefix}-name`}
        />
        <TextField
          label="Generic name"
          placeholder="Amoxicillin"
          value={genericName}
          onChangeText={setGenericName}
          error={show(errors.genericName)}
          containerStyle={{ flex: 1, minWidth: 220 }}
          testID={`${prefix}-generic`}
        />
      </HStack>

      <ListInput
        label="Active ingredients"
        required
        values={ingredients}
        onChange={setIngredients}
        max={10}
        maxLength={80}
        placeholder="Amoxicillin"
        hint="Allergy checks match on ingredients, so list every active ingredient."
        error={show(errors.ingredients)}
        testID={`${prefix}-ingredients`}
      />

      <HStack gap={12} wrap>
        <View style={{ flex: 1, minWidth: 180 }} testID={`${prefix}-form`}>
          <Select
            label="Form"
            value={form}
            options={FORM_OPTIONS}
            onChange={(v) => setForm(v as MedicineForm)}
          />
        </View>
        <TextField
          label="Strength"
          placeholder="500 mg"
          value={strength}
          onChangeText={setStrength}
          error={show(errors.strength)}
          containerStyle={{ flex: 1, minWidth: 160 }}
          testID={`${prefix}-strength`}
        />
        <View style={{ flex: 1, minWidth: 180 }} testID={`${prefix}-route`}>
          <Select
            label="Route"
            value={route}
            options={ROUTE_OPTIONS}
            onChange={(v) => setRoute(v as MedicineRoute)}
          />
        </View>
      </HStack>

      <HStack gap={12} wrap>
        <TextField
          label="Drug class"
          placeholder="Penicillin antibiotic"
          value={drugClass}
          onChangeText={setDrugClass}
          error={show(errors.drugClass)}
          containerStyle={{ flex: 2, minWidth: 220 }}
          testID={`${prefix}-class`}
        />
        <TextField
          label="ATC code"
          placeholder="J01CA04"
          value={atcCode}
          onChangeText={setAtcCode}
          autoCapitalize="characters"
          error={show(errors.atcCode)}
          containerStyle={{ flex: 1, minWidth: 140 }}
          testID={`${prefix}-atc`}
        />
        <View style={{ flex: 1, minWidth: 180 }} testID={`${prefix}-schedule`}>
          <Select
            label="Schedule"
            value={schedule}
            options={SCHEDULE_OPTIONS}
            onChange={(v) => setSchedule(v as DrugSchedule)}
          />
        </View>
      </HStack>

      <ListInput
        label="Allergy groups"
        values={allergyGroups}
        onChange={setAllergyGroups}
        max={10}
        maxLength={40}
        placeholder="Penicillins"
        hint="Only needed when the allergy check would not recognise the ingredients."
        testID={`${prefix}-allergy-groups`}
      />

      <ToggleRow
        label="Narcotic"
        description="A narcotic or psychotropic controlled under the NDPS Act."
        checked={isNarcotic}
        onChange={setIsNarcotic}
        testID={`${prefix}-narcotic`}
      />

      <VStack gap={6}>
        <Text variant="overline" tone="tertiary">
          Prescribing defaults
        </Text>
        <Text variant="caption" tone="tertiary">
          Offered to the doctor when they add this medicine. Never applied
          without them seeing it.
        </Text>
      </VStack>
      <HStack gap={12} wrap>
        <TextField
          label="Dose"
          placeholder="1 tablet"
          value={defaultDose}
          onChangeText={setDefaultDose}
          error={show(errors.defaultDose)}
          containerStyle={{ flex: 1, minWidth: 160 }}
          testID={`${prefix}-dose`}
        />
        <View style={{ flex: 1, minWidth: 180 }} testID={`${prefix}-frequency`}>
          <Select
            label="Frequency"
            value={defaultFrequency}
            options={FREQUENCY_OPTIONS}
            onChange={setDefaultFrequency}
          />
        </View>
        <TextField
          label="Duration"
          numericField
          suffix="days"
          value={duration}
          onChangeText={setDuration}
          error={show(errors.duration)}
          containerStyle={{ flex: 1, minWidth: 140 }}
          testID={`${prefix}-duration`}
        />
      </HStack>
      <TextField
        label="Caution note"
        placeholder="Reduce dose in renal impairment"
        value={cautionNote}
        onChangeText={setCautionNote}
        multiline
        error={show(errors.cautionNote)}
        hint="Shown beside the medicine while prescribing."
        testID={`${prefix}-caution`}
      />

      <HStack gap={8} wrap>
        <Button
          label={submitLabel}
          fullWidth={false}
          loading={mutation.isPending}
          onPress={submit}
          testID={`${prefix}-submit`}
        />
        <Button
          label="Cancel"
          variant="ghost"
          fullWidth={false}
          onPress={onCancel}
          testID={`${prefix}-cancel`}
        />
      </HStack>
    </VStack>
  );
}

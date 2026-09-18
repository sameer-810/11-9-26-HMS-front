import React, { useState } from "react";
import { View } from "react-native";
import { FlaskConical, Plus } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import {
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
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { formatRupees } from "@shared/format";
import {
  useCreateLabTest,
  useLabCatalogue,
  useLoadStandardLabCatalogue,
  useUpdateLabTest,
} from "@modules/laboratory/hooks/useLaboratory";
import type { LabTestPatch } from "@modules/laboratory/api/laboratoryApi";
import type {
  LabRangeBand,
  LabTest,
  LabTestParameterDef,
  LabUrgency,
} from "@modules/laboratory/types";

// Mirrors laboratory.validation.js.
const TEST_CODE = /^[A-Za-z0-9_]{2,20}$/;
const MAX_PRICE = 10_000_000;
const MAX_MINUTES = 20160;
const URGENCIES: { key: LabUrgency; label: string }[] = [
  { key: "routine", label: "Routine" },
  { key: "urgent", label: "Urgent" },
  { key: "stat", label: "Stat" },
];

function priceError(value: string) {
  const n = Number(value);
  return !/^\d+(\.\d{1,2})?$/.test(value.trim()) || n > MAX_PRICE
    ? "Rupees, up to two decimal places"
    : undefined;
}

function minutesError(value: string) {
  const n = Number(value);
  return !/^\d+$/.test(value.trim()) || n < 1 || n > MAX_MINUTES
    ? "Whole minutes, 1 to 20160"
    : undefined;
}

/** 240 -> "4 h", 90 -> "1 h 30 min", 1440 -> "1 day". */
export function formatMinutes(total: number) {
  if (!Number.isFinite(total) || total <= 0) return "—";
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  return (
    [
      days ? `${days} day${days === 1 ? "" : "s"}` : "",
      hours ? `${hours} h` : "",
      minutes ? `${minutes} min` : "",
    ]
      .filter(Boolean)
      .join(" ") || "—"
  );
}

function ageText(years: number) {
  if (years === 0) return "0";
  if (years < 1 / 12) return `${Math.round(years * 365)} days`;
  if (years < 1) return `${Math.round(years * 12)} months`;
  return `${years} years`;
}

function bandLabel(r: LabRangeBand) {
  const who = r.sex === "any" ? "Everyone" : r.sex === "male" ? "Men" : "Women";
  const from = r.ageMinYears ?? 0;
  const to = r.ageMaxYears;
  if (!from && to == null) return who;
  if (to == null) return `${who}, from ${ageText(from)}`;
  return `${who}, ${ageText(from)} to ${ageText(to)}`;
}

function rangeText(r: LabRangeBand, unit: string) {
  const u = unit ? ` ${unit}` : "";
  const normal =
    r.low != null && r.high != null
      ? `${r.low}–${r.high}${u}`
      : r.low != null
        ? `${r.low}${u} or more`
        : r.high != null
          ? `up to ${r.high}${u}`
          : "no limits";
  const critical = [
    r.criticalLow != null ? `below ${r.criticalLow}` : "",
    r.criticalHigh != null ? `above ${r.criticalHigh}` : "",
  ].filter(Boolean);
  return critical.length
    ? `${normal} · critical ${critical.join(" or ")}`
    : normal;
}

/**
 * The laboratory test catalogue: what doctors can order, and what each test costs.
 * Prices and turnaround are set here; reference ranges are shown read-only.
 */
export function LabTestsPanel() {
  const { data, isLoading, isError, error, refetch } = useLabCatalogue();
  const loadStandard = useLoadStandardLabCatalogue();
  const update = useUpdateLabTest();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [ranges, setRanges] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<LabTest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const clearMessages = () => {
    setNotice(null);
    setFailure(null);
  };

  const tests = data ?? [];
  const term = search.trim().toLowerCase();
  const shown = tests.filter(
    (t) =>
      !term ||
      t.name.toLowerCase().includes(term) ||
      t.code.toLowerCase().includes(term) ||
      (t.category || "").toLowerCase().includes(term),
  );
  const categories = [...new Set(shown.map((t) => t.category || "General"))];

  const load = () => {
    clearMessages();
    loadStandard.mutate(undefined, {
      onSuccess: (res) =>
        setNotice(
          res.added.length
            ? `${res.added.length} standard tests added. Check the prices before doctors order them.`
            : "Every standard test is already in the catalogue.",
        ),
      onError: (e) =>
        setFailure(apiErrorMessage(e, "Could not load the standard catalogue")),
    });
  };

  const setActive = (t: LabTest, active: boolean) => {
    clearMessages();
    update.mutate(
      { id: t.id, body: { isActive: active } },
      {
        onSuccess: () =>
          setNotice(
            active
              ? `${t.name} can be ordered again.`
              : `${t.name} is switched off. Doctors can no longer order it; orders already placed carry on.`,
          ),
        onError: (e) =>
          setFailure(apiErrorMessage(e, `Could not change ${t.name}`)),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <Card testID="labtests-panel">
      <SectionHeader
        title="Laboratory tests"
        subtitle="What doctors can order, what each test costs, how soon it is due and how the patient should prepare. Orders already placed keep the price and ranges they were ordered with."
      />
      <VStack gap={12}>
        <HStack gap={8} align="center" wrap>
          <SearchInput
            value={search}
            onChangeText={setSearch}
            placeholder="Test name, code or category"
            style={{ flex: 1, minWidth: 220 }}
            testID="labtests-search"
          />
          {!creating ? (
            <Button
              label="Add a test"
              size="sm"
              fullWidth={false}
              icon={<Plus size={15} color="#FFFFFF" />}
              onPress={() => {
                clearMessages();
                setCreating(true);
              }}
              testID="labtests-create-open"
            />
          ) : null}
        </HStack>

        {failure ? (
          <View testID="labtests-error">
            <Banner
              tone="danger"
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}
        {notice ? (
          <View testID="labtests-notice">
            <Banner tone="success" message={notice} />
          </View>
        ) : null}

        {creating ? (
          <LabTestCreateForm
            onCancel={() => setCreating(false)}
            onCreated={(t) => {
              setCreating(false);
              setNotice(
                `${t.name} (${t.code}) added at ${formatRupees(t.price)}. Doctors can order it now.`,
              );
            }}
          />
        ) : null}

        {isLoading ? (
          <VStack gap={8}>
            <Skeleton height={56} />
            <Skeleton height={56} />
          </VStack>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : tests.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No laboratory tests yet"
            message="Start from the standard catalogue of common tests with Indian reference ranges, then set your prices."
            action={
              <Button
                label="Load the standard catalogue"
                fullWidth={false}
                loading={loadStandard.isPending}
                onPress={load}
                testID="labtests-load-standard"
              />
            }
          />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No test matches"
            message="Try another name or code."
          />
        ) : (
          <VStack gap={14}>
            <Text variant="body-sm" tone="tertiary">
              {tests.length} test{tests.length === 1 ? "" : "s"}. Reference
              ranges are read-only here; the laboratory lead changes them
              through the API, so a change is checked against every band.
            </Text>
            {categories.map((category) => (
              <VStack key={category} gap={6}>
                <Text variant="overline" tone="tertiary">
                  {category}
                </Text>
                {shown
                  .filter((t) => (t.category || "General") === category)
                  .map((t) =>
                    editing === t.id ? (
                      <LabTestEditForm
                        key={t.id}
                        test={t}
                        onCancel={() => setEditing(null)}
                        onSaved={(saved) => {
                          setEditing(null);
                          setNotice(
                            `${saved.name} saved at ${formatRupees(saved.price)}. New orders use it; orders already placed keep their price.`,
                          );
                        }}
                      />
                    ) : (
                      <LabTestRow
                        key={t.id}
                        test={t}
                        showRanges={ranges === t.id}
                        activating={
                          update.isPending && update.variables?.id === t.id
                        }
                        onToggleRanges={() =>
                          setRanges(ranges === t.id ? null : t.id)
                        }
                        onEdit={() => {
                          clearMessages();
                          setEditing(t.id);
                        }}
                        onDeactivate={() => setConfirm(t)}
                        onActivate={() => setActive(t, true)}
                      />
                    ),
                  )}
              </VStack>
            ))}
          </VStack>
        )}
      </VStack>

      <ConfirmDialog
        visible={confirm !== null}
        title={`Switch off ${confirm?.name ?? "this test"}?`}
        message="Doctors can no longer order it. Orders already placed carry on and their results are kept. You can switch it back on here."
        confirmLabel="Yes, switch off"
        destructive
        loading={update.isPending}
        onConfirm={() => confirm && setActive(confirm, false)}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

function LabTestRow({
  test: t,
  showRanges,
  activating,
  onToggleRanges,
  onEdit,
  onDeactivate,
  onActivate,
}: {
  test: LabTest;
  showRanges: boolean;
  activating: boolean;
  onToggleRanges: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) {
  const tat = t.targetMinutes;
  return (
    <Card compact testID={`labtest-row-${t.code}`}>
      <VStack gap={8}>
        <HStack gap={12} align="center" wrap>
          <VStack gap={2} style={{ flex: 1, minWidth: 240 }}>
            <HStack gap={8} align="center" wrap>
              <Text variant="label-lg">{t.name}</Text>
              <Text variant="caption" tone="tertiary">
                {t.code}
              </Text>
              {!t.isActive ? <StatusChip status="inactive" size="sm" /> : null}
            </HStack>
            <Text variant="body-sm" tone="secondary" tabular>
              <Text
                variant="body-sm"
                tone="primary"
                tabular
                testID={`labtest-price-${t.code}`}
              >
                {formatRupees(t.price)}
              </Text>
              {t.sampleType ? ` · ${t.sampleType}` : ""}
              {` · ${t.parameters.length} result${t.parameters.length === 1 ? "" : "s"}`}
            </Text>
            {tat ? (
              <Text
                variant="caption"
                tone="tertiary"
                testID={`labtest-turnaround-${t.code}`}
              >
                Due within {formatMinutes(tat.routine)} routine,{" "}
                {formatMinutes(tat.urgent)} urgent, {formatMinutes(tat.stat)}{" "}
                stat
              </Text>
            ) : null}
            {t.preparation ? (
              <Text variant="caption" tone="tertiary">
                Preparation: {t.preparation}
              </Text>
            ) : null}
          </VStack>
          <HStack gap={6} wrap>
            <Button
              label={showRanges ? "Hide ranges" : "Ranges"}
              size="xs"
              variant="ghost"
              fullWidth={false}
              accessibilityHint={`Show ${t.name}'s reference ranges`}
              onPress={onToggleRanges}
              testID={`labtest-ranges-open-${t.code}`}
            />
            {t.isActive ? (
              <>
                <Button
                  label="Edit"
                  size="xs"
                  variant="secondary"
                  fullWidth={false}
                  accessibilityHint={`Edit ${t.name}'s price, turnaround or preparation`}
                  onPress={onEdit}
                  testID={`labtest-edit-open-${t.code}`}
                />
                <Button
                  label="Switch off"
                  size="xs"
                  variant="ghost"
                  fullWidth={false}
                  accessibilityHint={`Stop doctors ordering ${t.name}`}
                  onPress={onDeactivate}
                  testID={`labtest-deactivate-${t.code}`}
                />
              </>
            ) : (
              <Button
                label="Switch on"
                size="xs"
                variant="ghost"
                fullWidth={false}
                accessibilityHint={`Let doctors order ${t.name} again`}
                loading={activating}
                onPress={onActivate}
                testID={`labtest-activate-${t.code}`}
              />
            )}
          </HStack>
        </HStack>
        {showRanges ? <RangesView test={t} /> : null}
      </VStack>
    </Card>
  );
}

function RangesView({ test }: { test: LabTest }) {
  return (
    <VStack
      gap={8}
      style={{
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: palette.border.subtle,
      }}
      testID={`labtest-ranges-${test.code}`}
    >
      <Text variant="caption" tone="tertiary">
        Read-only. Range changes are made by the laboratory lead through the
        API, where each band is checked against the critical values.
      </Text>
      {test.parameters.map((p) => (
        <ParameterRanges key={p.code} parameter={p} />
      ))}
    </VStack>
  );
}

function ParameterRanges({ parameter: p }: { parameter: LabTestParameterDef }) {
  const unit = p.unit || "";
  return (
    <VStack gap={2}>
      <Text variant="label">
        {p.name}
        {unit ? ` (${unit})` : ""}
        {p.required === false ? " · optional" : ""}
      </Text>
      {p.type === "choice" ? (
        <Text variant="caption" tone="secondary">
          One of: {(p.choices || []).join(", ")}
          {p.normalText ? ` · normal: ${p.normalText}` : ""}
          {p.criticalValues?.length
            ? ` · critical: ${p.criticalValues.join(", ")}`
            : ""}
        </Text>
      ) : p.type === "text" ? (
        <Text variant="caption" tone="secondary">
          Written result{p.normalText ? ` · normal: ${p.normalText}` : ""}
        </Text>
      ) : (p.ranges || []).length === 0 ? (
        <Text variant="caption" tone="secondary">
          No reference range
          {p.criticalLow != null || p.criticalHigh != null
            ? ` · critical ${[p.criticalLow != null ? `below ${p.criticalLow}` : "", p.criticalHigh != null ? `above ${p.criticalHigh}` : ""].filter(Boolean).join(" or ")}`
            : ""}
        </Text>
      ) : (
        (p.ranges || []).map((r, i) => (
          <Text key={i} variant="caption" tone="secondary" tabular>
            {bandLabel(r)}:{" "}
            {rangeText(
              {
                ...r,
                criticalLow: r.criticalLow ?? p.criticalLow,
                criticalHigh: r.criticalHigh ?? p.criticalHigh,
              },
              unit,
            )}
          </Text>
        ))
      )}
    </VStack>
  );
}

function TurnaroundFields({
  values,
  onChange,
  errors,
  testIDPrefix,
}: {
  values: Record<LabUrgency, string>;
  onChange: (key: LabUrgency, value: string) => void;
  errors: Record<LabUrgency, string | undefined>;
  testIDPrefix: string;
}) {
  return (
    <HStack gap={12} wrap>
      {URGENCIES.map(({ key, label }) => (
        <TextField
          key={key}
          label={`${label} turnaround`}
          numericField
          suffix="min"
          value={values[key]}
          onChangeText={(v) => onChange(key, v)}
          error={errors[key]}
          hint={errors[key] ? undefined : formatMinutes(Number(values[key]))}
          containerStyle={{ flex: 1, minWidth: 150 }}
          testID={`${testIDPrefix}-${key}`}
        />
      ))}
    </HStack>
  );
}

function LabTestEditForm({
  test,
  onCancel,
  onSaved,
}: {
  test: LabTest;
  onCancel: () => void;
  onSaved: (t: LabTest) => void;
}) {
  const update = useUpdateLabTest();
  const [price, setPrice] = useState(String(test.price ?? 0));
  const [tat, setTat] = useState<Record<LabUrgency, string>>({
    routine: String(test.targetMinutes?.routine ?? ""),
    urgent: String(test.targetMinutes?.urgent ?? ""),
    stat: String(test.targetMinutes?.stat ?? ""),
  });
  const [preparation, setPreparation] = useState(test.preparation ?? "");
  const [attempted, setAttempted] = useState(false);

  const tatErrors = {
    routine: minutesError(tat.routine),
    urgent: minutesError(tat.urgent),
    stat: minutesError(tat.stat),
  };
  const errors = {
    price: priceError(price),
    preparation:
      preparation.trim().length > 500 ? "At most 500 characters" : undefined,
    ...tatErrors,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const patch: LabTestPatch = {};
    if (Number(price) !== (test.price ?? 0)) patch.price = Number(price);
    const minutes = {
      routine: Number(tat.routine),
      urgent: Number(tat.urgent),
      stat: Number(tat.stat),
    };
    if (URGENCIES.some(({ key }) => minutes[key] !== test.targetMinutes?.[key]))
      patch.targetMinutes = minutes;
    if (preparation.trim() !== (test.preparation ?? ""))
      patch.preparation = preparation.trim();
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: test.id, body: patch }, { onSuccess: onSaved });
  };

  return (
    <Card testID={`labtest-edit-${test.code}`}>
      <SectionHeader
        title={`Edit ${test.name}`}
        subtitle={`${test.code} · the code stays, because past results are linked by it`}
      />
      <VStack gap={12}>
        {update.isError ? (
          <View testID="labtest-edit-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(update.error, "Could not save the test")}
            />
          </View>
        ) : null}
        <TextField
          label="Price"
          required
          numericField
          suffix="₹"
          value={price}
          onChangeText={setPrice}
          error={show(errors.price)}
          hint="Charged on the patient's bill for each new order."
          containerStyle={{ maxWidth: 260 }}
          testID="labtest-edit-price"
        />
        <TurnaroundFields
          values={tat}
          onChange={(k, v) => setTat((s) => ({ ...s, [k]: v }))}
          errors={{
            routine: show(tatErrors.routine),
            urgent: show(tatErrors.urgent),
            stat: show(tatErrors.stat),
          }}
          testIDPrefix="labtest-edit"
        />
        <TextField
          label="Preparation"
          placeholder="Fasting for 8 to 10 hours. Water is allowed."
          value={preparation}
          onChangeText={setPreparation}
          multiline
          error={show(errors.preparation)}
          hint="Shown to whoever collects the sample."
          testID="labtest-edit-preparation"
        />
        <HStack gap={8} wrap>
          <Button
            label="Save test"
            fullWidth={false}
            loading={update.isPending}
            onPress={submit}
            testID="labtest-edit-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="labtest-edit-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

const RESULT_TYPES = [
  { value: "numeric", label: "A number", sublabel: "Flagged against the range" },
  { value: "text", label: "Written result", sublabel: "No range" },
];

/** A single-result test. Panels with several results come from the standard catalogue. */
function LabTestCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (t: LabTest) => void;
}) {
  const create = useCreateLabTest();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sampleType, setSampleType] = useState("");
  const [price, setPrice] = useState("");
  const [resultType, setResultType] = useState<"numeric" | "text">("numeric");
  const [unit, setUnit] = useState("");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [tat, setTat] = useState<Record<LabUrgency, string>>({
    routine: "1440",
    urgent: "240",
    stat: "60",
  });
  const [preparation, setPreparation] = useState("");
  const [attempted, setAttempted] = useState(false);

  const numeric = resultType === "numeric";
  const bound = (v: string) =>
    v.trim() === "" || Number.isFinite(Number(v)) ? undefined : "A number";
  const tatErrors = {
    routine: minutesError(tat.routine),
    urgent: minutesError(tat.urgent),
    stat: minutesError(tat.stat),
  };
  const errors = {
    code: TEST_CODE.test(code.trim())
      ? undefined
      : "2–20 letters, digits or underscores",
    name:
      name.trim().length < 2 || name.trim().length > 120
        ? "Between 2 and 120 characters"
        : undefined,
    category: category.trim().length > 60 ? "At most 60 characters" : undefined,
    sampleType:
      sampleType.trim().length > 60 ? "At most 60 characters" : undefined,
    price: priceError(price),
    unit: unit.trim().length > 30 ? "At most 30 characters" : undefined,
    low: numeric ? bound(low) : undefined,
    high: numeric
      ? (bound(high) ??
        (low.trim() !== "" &&
        high.trim() !== "" &&
        Number(low) > Number(high)
          ? "Must not be below the low end"
          : undefined))
      : undefined,
    preparation:
      preparation.trim().length > 500 ? "At most 500 characters" : undefined,
    ...tatErrors,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const testCode = code.trim().toUpperCase();
    const hasRange = numeric && (low.trim() !== "" || high.trim() !== "");
    create.mutate(
      {
        code: testCode,
        name: name.trim(),
        category: category.trim() || undefined,
        sampleType: sampleType.trim() || undefined,
        preparation: preparation.trim() || undefined,
        price: Number(price),
        targetMinutes: {
          routine: Number(tat.routine),
          urgent: Number(tat.urgent),
          stat: Number(tat.stat),
        },
        parameters: [
          {
            code: testCode,
            name: name.trim(),
            unit: unit.trim() || undefined,
            type: resultType,
            ranges: hasRange
              ? [
                  {
                    sex: "any",
                    low: low.trim() === "" ? null : Number(low),
                    high: high.trim() === "" ? null : Number(high),
                  },
                ]
              : [],
          },
        ],
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <Card testID="labtests-create">
      <SectionHeader
        title="New test"
        subtitle="A test with one result. Panels with several results, and age or sex-specific ranges, come from the standard catalogue."
      />
      <VStack gap={12}>
        {create.isError ? (
          <View testID="labtests-create-error">
            <Banner
              tone="danger"
              message={
                apiErrorCode(create.error) === "TEST_CODE_TAKEN"
                  ? `The code ${code.trim().toUpperCase()} is already used, perhaps by a switched-off test. Choose another code.`
                  : apiErrorMessage(create.error, "Could not add the test")
              }
            />
          </View>
        ) : null}
        <HStack gap={12} wrap>
          <TextField
            label="Name"
            required
            placeholder="Serum magnesium"
            value={name}
            onChangeText={setName}
            error={show(errors.name)}
            containerStyle={{ flex: 2, minWidth: 220 }}
            testID="labtests-create-name"
          />
          <TextField
            label="Code"
            required
            placeholder="MG"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={20}
            error={show(errors.code)}
            hint="Printed on orders. Cannot be changed later."
            containerStyle={{ flex: 1, minWidth: 180 }}
            testID="labtests-create-code"
          />
        </HStack>
        <HStack gap={12} wrap>
          <TextField
            label="Category"
            placeholder="Biochemistry"
            value={category}
            onChangeText={setCategory}
            error={show(errors.category)}
            containerStyle={{ flex: 1, minWidth: 180 }}
            testID="labtests-create-category"
          />
          <TextField
            label="Sample"
            placeholder="Serum"
            value={sampleType}
            onChangeText={setSampleType}
            error={show(errors.sampleType)}
            containerStyle={{ flex: 1, minWidth: 160 }}
            testID="labtests-create-sample"
          />
          <TextField
            label="Price"
            required
            numericField
            suffix="₹"
            value={price}
            onChangeText={setPrice}
            error={show(errors.price)}
            containerStyle={{ flex: 1, minWidth: 150 }}
            testID="labtests-create-price"
          />
        </HStack>
        <HStack gap={12} wrap align="flex-start">
          <View
            style={{ flex: 1, minWidth: 180 }}
            testID="labtests-create-type"
          >
            <Select
              label="Result"
              value={resultType}
              options={RESULT_TYPES}
              onChange={(v) => setResultType(v as "numeric" | "text")}
            />
          </View>
          {numeric ? (
            <>
              <TextField
                label="Unit"
                placeholder="mg/dL"
                value={unit}
                onChangeText={setUnit}
                error={show(errors.unit)}
                containerStyle={{ width: 120 }}
                testID="labtests-create-unit"
              />
              <TextField
                label="Normal from"
                numericField
                value={low}
                onChangeText={setLow}
                error={show(errors.low)}
                containerStyle={{ width: 130 }}
                testID="labtests-create-low"
              />
              <TextField
                label="Normal to"
                numericField
                value={high}
                onChangeText={setHigh}
                error={show(errors.high)}
                containerStyle={{ width: 160 }}
                testID="labtests-create-high"
              />
            </>
          ) : null}
        </HStack>
        <TurnaroundFields
          values={tat}
          onChange={(k, v) => setTat((s) => ({ ...s, [k]: v }))}
          errors={{
            routine: show(tatErrors.routine),
            urgent: show(tatErrors.urgent),
            stat: show(tatErrors.stat),
          }}
          testIDPrefix="labtests-create"
        />
        <TextField
          label="Preparation"
          placeholder="No fasting required."
          value={preparation}
          onChangeText={setPreparation}
          multiline
          error={show(errors.preparation)}
          testID="labtests-create-preparation"
        />
        <HStack gap={8} wrap>
          <Button
            label="Add test"
            fullWidth={false}
            loading={create.isPending}
            onPress={submit}
            testID="labtests-create-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="labtests-create-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

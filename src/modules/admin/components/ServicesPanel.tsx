import React, { useState } from "react";
import { View } from "react-native";
import { Plus, ReceiptText } from "lucide-react-native";

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
  useBillingSettings,
  useCreateTariffService,
  useTariffServices,
  useUpdateBillingSettings,
  useUpdateTariffService,
} from "@modules/admin/hooks/useAdmin";
import {
  TARIFF_CATEGORY_LABELS,
  type BillingSettings,
  type BillingSettingsPatch,
  type TariffCategory,
  type TariffPatch,
  type TariffService,
  type TaxHead,
} from "@modules/admin/types";

const CODE = /^[A-Za-z0-9_-]{2,20}$/;
const MAX_PRICE = 100_000_000;
const MAX_TAX = 40;

const CATEGORIES = Object.keys(TARIFF_CATEGORY_LABELS) as TariffCategory[];
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  value: c,
  label: TARIFF_CATEGORY_LABELS[c],
}));

/** Rupees to at most two decimal places; the API stores paise. */
function priceError(value: string) {
  const n = Number(value);
  return !/^\d+(\.\d{1,2})?$/.test(value.trim()) || n < 0 || n > MAX_PRICE
    ? "Rupees, up to two decimal places"
    : undefined;
}

function taxError(value: string) {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) || n < 0 || n > MAX_TAX
    ? `Between 0 and ${MAX_TAX}%`
    : undefined;
}

const taxLabel = (rate: number) => (rate ? `${rate}% tax` : "No tax");

/**
 * The tariff billing staff add to bills, and the tax rates applied to charges compiled from
 * clinical records. Prices change only future charges; lines already on a bill keep theirs.
 */
export function ServicesPanel() {
  return (
    <VStack gap={12} testID="services-panel">
      <TariffList />
      <BillingSettingsCard />
    </VStack>
  );
}

function TariffList() {
  const { data, isLoading, isError, error, refetch } = useTariffServices();
  const update = useUpdateTariffService();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<TariffService | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const clearMessages = () => {
    setNotice(null);
    setFailure(null);
  };

  const term = search.trim().toLowerCase();
  const all = (data ?? []).filter(
    (s) =>
      !term ||
      s.name.toLowerCase().includes(term) ||
      s.code.toLowerCase().includes(term),
  );

  const setActive = (s: TariffService, active: boolean) => {
    clearMessages();
    update.mutate(
      { id: s.id, body: { isActive: active } },
      {
        onSuccess: () => {
          setNotice(
            active
              ? `${s.name} is back on the tariff.`
              : `${s.name} is deactivated. Billing can no longer add it; bills that already have it are unchanged.`,
          );
        },
        onError: (e) =>
          setFailure(apiErrorMessage(e, `Could not change ${s.name}`)),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <Card testID="tariff-card">
      <SectionHeader
        title="Services and prices"
        subtitle="What billing staff can add to a bill by hand. Consultation, bed, lab and pharmacy charges are priced where they are set up."
      />
      <VStack gap={12}>
        <HStack gap={8} align="center" wrap>
          <SearchInput
            value={search}
            onChangeText={setSearch}
            placeholder="Service name or code"
            style={{ flex: 1, minWidth: 220 }}
            testID="tariff-search"
          />
          {!creating ? (
            <Button
              label="Add service"
              size="sm"
              fullWidth={false}
              icon={<Plus size={15} color="#FFFFFF" />}
              onPress={() => {
                clearMessages();
                setCreating(true);
              }}
              testID="tariff-create-open"
            />
          ) : null}
        </HStack>

        {failure ? (
          <View testID="tariff-error">
            <Banner
              tone="danger"
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}
        {notice ? (
          <View testID="tariff-notice">
            <Banner tone="success" message={notice} />
          </View>
        ) : null}

        {creating ? (
          <TariffCreateForm
            onCancel={() => setCreating(false)}
            onCreated={(s) => {
              setCreating(false);
              setNotice(
                `${s.name} (${s.code}) added at ${formatRupees(s.price)}. Billing can add it now.`,
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
        ) : all.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title={term ? "No service matches" : "No services yet"}
            message="Add dressings, procedures and other charges billing staff put on bills."
          />
        ) : (
          <VStack gap={14}>
            {CATEGORIES.map((category) => {
              const rows = all.filter((s) => s.category === category);
              if (rows.length === 0) return null;
              return (
                <VStack key={category} gap={6}>
                  <Text variant="overline" tone="tertiary">
                    {TARIFF_CATEGORY_LABELS[category]}
                  </Text>
                  {rows.map((s) =>
                    editing === s.id ? (
                      <TariffEditForm
                        key={s.id}
                        service={s}
                        onCancel={() => setEditing(null)}
                        onSaved={(saved) => {
                          setEditing(null);
                          setNotice(
                            `${saved.name} saved at ${formatRupees(saved.price)}. New charges use it; bills already raised keep their price.`,
                          );
                        }}
                      />
                    ) : (
                      <Card key={s.id} compact testID={`tariff-row-${s.code}`}>
                        <HStack gap={12} align="center" wrap>
                          <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
                            <HStack gap={8} align="center" wrap>
                              <Text variant="label-lg">{s.name}</Text>
                              <Text variant="caption" tone="tertiary">
                                {s.code}
                              </Text>
                              {!s.isActive ? (
                                <StatusChip status="inactive" size="sm" />
                              ) : null}
                            </HStack>
                            <Text
                              variant="body-sm"
                              tone="secondary"
                              tabular
                              testID={`tariff-price-${s.code}`}
                            >
                              {formatRupees(s.price)} · {taxLabel(s.taxRate)}
                            </Text>
                          </VStack>
                          {s.isActive ? (
                            <HStack gap={6}>
                              <Button
                                label="Edit"
                                size="xs"
                                variant="secondary"
                                fullWidth={false}
                                accessibilityHint={`Edit ${s.name}`}
                                onPress={() => {
                                  clearMessages();
                                  update.reset();
                                  setEditing(s.id);
                                }}
                                testID={`tariff-edit-open-${s.code}`}
                              />
                              <Button
                                label="Deactivate"
                                size="xs"
                                variant="ghost"
                                fullWidth={false}
                                accessibilityHint={`Deactivate ${s.name}`}
                                onPress={() => setConfirm(s)}
                                testID={`tariff-deactivate-${s.code}`}
                              />
                            </HStack>
                          ) : (
                            <Button
                              label="Reactivate"
                              size="xs"
                              variant="ghost"
                              fullWidth={false}
                              accessibilityHint={`Put ${s.name} back on the tariff`}
                              loading={
                                update.isPending &&
                                update.variables?.id === s.id
                              }
                              onPress={() => setActive(s, true)}
                              testID={`tariff-activate-${s.code}`}
                            />
                          )}
                        </HStack>
                      </Card>
                    ),
                  )}
                </VStack>
              );
            })}
          </VStack>
        )}
      </VStack>

      <ConfirmDialog
        visible={confirm !== null}
        title={`Deactivate ${confirm?.name ?? "this service"}?`}
        message="Billing staff can no longer add it to a bill. Bills that already include it are unchanged. You can reactivate it here later."
        confirmLabel="Yes, deactivate"
        destructive
        loading={update.isPending}
        onConfirm={() => confirm && setActive(confirm, false)}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

function TariffCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (s: TariffService) => void;
}) {
  const create = useCreateTariffService();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TariffCategory>("procedure");
  const [price, setPrice] = useState("");
  const [tax, setTax] = useState("0");
  const [attempted, setAttempted] = useState(false);

  const errors = {
    code: CODE.test(code.trim())
      ? undefined
      : "2–20 letters, digits, hyphens or underscores",
    name:
      name.trim().length < 2 || name.trim().length > 120
        ? "Between 2 and 120 characters"
        : undefined,
    price: priceError(price),
    tax: taxError(tax),
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    create.mutate(
      {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        category,
        price: Number(price),
        taxRate: Number(tax),
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <Card testID="tariff-create">
      <SectionHeader title="New service" />
      <VStack gap={12}>
        {create.isError ? (
          <View testID="tariff-create-error">
            <Banner
              tone="danger"
              message={
                apiErrorCode(create.error) === "TARIFF_EXISTS"
                  ? `The code ${code.trim().toUpperCase()} is already used, perhaps by a deactivated service. Choose another code.`
                  : apiErrorMessage(create.error, "Could not add the service")
              }
            />
          </View>
        ) : null}
        <HStack gap={12} wrap>
          <TextField
            label="Name"
            required
            placeholder="Wound dressing"
            value={name}
            onChangeText={setName}
            error={show(errors.name)}
            containerStyle={{ flex: 2, minWidth: 220 }}
            testID="tariff-create-name"
          />
          <TextField
            label="Code"
            required
            placeholder="DRESS-S"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={20}
            error={show(errors.code)}
            hint="Printed on the bill. Cannot be changed later."
            containerStyle={{ flex: 1, minWidth: 180 }}
            testID="tariff-create-code"
          />
        </HStack>
        <HStack gap={12} wrap>
          <View
            style={{ flex: 1, minWidth: 180 }}
            testID="tariff-create-category"
          >
            <Select
              label="Category"
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={(v) => setCategory(v as TariffCategory)}
            />
          </View>
          <TextField
            label="Price"
            required
            numericField
            suffix="₹"
            value={price}
            onChangeText={setPrice}
            error={show(errors.price)}
            containerStyle={{ flex: 1, minWidth: 160 }}
            testID="tariff-create-price"
          />
          <TextField
            label="Tax"
            numericField
            suffix="%"
            value={tax}
            onChangeText={setTax}
            error={show(errors.tax)}
            containerStyle={{ flex: 1, minWidth: 120 }}
            testID="tariff-create-tax"
          />
        </HStack>
        <HStack gap={8} wrap>
          <Button
            label="Add service"
            fullWidth={false}
            loading={create.isPending}
            onPress={submit}
            testID="tariff-create-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="tariff-create-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

function TariffEditForm({
  service,
  onCancel,
  onSaved,
}: {
  service: TariffService;
  onCancel: () => void;
  onSaved: (s: TariffService) => void;
}) {
  const update = useUpdateTariffService();
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(String(service.price));
  const [tax, setTax] = useState(String(service.taxRate));
  const [attempted, setAttempted] = useState(false);

  const errors = {
    name:
      name.trim().length < 2 || name.trim().length > 120
        ? "Between 2 and 120 characters"
        : undefined,
    price: priceError(price),
    tax: taxError(tax),
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const patch: TariffPatch = {};
    if (name.trim() !== service.name) patch.name = name.trim();
    if (Number(price) !== service.price) patch.price = Number(price);
    if (Number(tax) !== service.taxRate) patch.taxRate = Number(tax);
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: service.id, body: patch }, { onSuccess: onSaved });
  };

  return (
    <Card testID={`tariff-edit-${service.code}`}>
      <SectionHeader title={`Edit ${service.name}`} subtitle={service.code} />
      <VStack gap={12}>
        {update.isError ? (
          <View testID="tariff-edit-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                update.error,
                "Could not save the service",
              )}
            />
          </View>
        ) : null}
        <HStack gap={12} wrap>
          <TextField
            label="Name"
            required
            value={name}
            onChangeText={setName}
            error={show(errors.name)}
            containerStyle={{ flex: 2, minWidth: 220 }}
            testID="tariff-edit-name"
          />
          <TextField
            label="Price"
            required
            numericField
            suffix="₹"
            value={price}
            onChangeText={setPrice}
            error={show(errors.price)}
            containerStyle={{ flex: 1, minWidth: 160 }}
            testID="tariff-edit-price"
          />
          <TextField
            label="Tax"
            numericField
            suffix="%"
            value={tax}
            onChangeText={setTax}
            error={show(errors.tax)}
            containerStyle={{ flex: 1, minWidth: 120 }}
            testID="tariff-edit-tax"
          />
        </HStack>
        <HStack gap={8} wrap>
          <Button
            label="Save service"
            fullWidth={false}
            loading={update.isPending}
            onPress={submit}
            testID="tariff-edit-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="tariff-edit-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

// ---- Billing settings -------------------------------------------------------

const TAX_HEADS: { key: TaxHead; label: string }[] = [
  { key: "consultation", label: "Consultations" },
  { key: "room", label: "Bed and room charges" },
  { key: "laboratory", label: "Laboratory tests" },
  { key: "pharmacy", label: "Pharmacy" },
  { key: "procedure", label: "Procedures" },
];

function BillingSettingsCard() {
  const { data, isLoading, isError, error, refetch } = useBillingSettings();
  return (
    <Card testID="billing-settings">
      <SectionHeader
        title="Tax and receipts"
        subtitle="Tax applied to charges as bills are drawn up, and the note printed under every receipt."
      />
      {isLoading ? (
        <Skeleton height={160} />
      ) : isError || !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <SettingsForm settings={data} />
      )}
    </Card>
  );
}

function SettingsForm({ settings }: { settings: BillingSettings }) {
  const update = useUpdateBillingSettings();
  const initialRates = () =>
    Object.fromEntries(
      TAX_HEADS.map(({ key }) => [key, String(settings.taxRates?.[key] ?? 0)]),
    ) as Record<TaxHead, string>;
  const [rates, setRates] = useState(initialRates);
  const [footer, setFooter] = useState(settings.receiptFooter ?? "");
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);

  const errors = Object.fromEntries(
    TAX_HEADS.map(({ key }) => [key, taxError(rates[key])]),
  ) as Record<TaxHead, string | undefined>;
  const footerError =
    footer.trim().length > 500 ? "At most 500 characters" : undefined;
  const valid = !Object.values(errors).some(Boolean) && !footerError;

  const patch: BillingSettingsPatch = {};
  const changedRates = TAX_HEADS.filter(
    ({ key }) =>
      !errors[key] && Number(rates[key]) !== (settings.taxRates?.[key] ?? 0),
  );
  if (changedRates.length)
    patch.taxRates = Object.fromEntries(
      changedRates.map(({ key }) => [key, Number(rates[key])]),
    );
  if (footer.trim() !== (settings.receiptFooter ?? ""))
    patch.receiptFooter = footer.trim();
  const changed =
    Object.keys(patch).length > 0 ||
    TAX_HEADS.some(
      ({ key }) => rates[key] !== String(settings.taxRates?.[key] ?? 0),
    );

  const submit = () => {
    setAttempted(true);
    if (!valid || Object.keys(patch).length === 0) return;
    update.mutate(patch, {
      onSuccess: (next) => {
        setRates(
          Object.fromEntries(
            TAX_HEADS.map(({ key }) => [key, String(next.taxRates[key])]),
          ) as Record<TaxHead, string>,
        );
        setFooter(next.receiptFooter);
        setAttempted(false);
        setSaved(true);
      },
    });
  };

  return (
    <VStack gap={12}>
      {update.isError ? (
        <View testID="billing-settings-error">
          <Banner
            tone="danger"
            message={apiErrorMessage(
              update.error,
              "Could not save the billing settings",
            )}
          />
        </View>
      ) : null}
      {saved ? (
        <View testID="billing-settings-saved">
          <Banner
            tone="success"
            message="Saved. Bills drawn up from now on use these rates; bills already drawn up keep theirs."
          />
        </View>
      ) : null}
      <HStack gap={12} wrap>
        {TAX_HEADS.map(({ key, label }) => (
          <TextField
            key={key}
            label={label}
            numericField
            suffix="%"
            value={rates[key]}
            onChangeText={(v) => {
              setSaved(false);
              setRates((r) => ({ ...r, [key]: v }));
            }}
            error={attempted ? errors[key] : undefined}
            containerStyle={{ flex: 1, minWidth: 160 }}
            testID={`billing-tax-${key}`}
          />
        ))}
      </HStack>
      <TextField
        label="Receipt footer"
        placeholder="Thank you. Keep this receipt for insurance claims."
        value={footer}
        onChangeText={(v) => {
          setSaved(false);
          setFooter(v);
        }}
        multiline
        error={attempted ? footerError : undefined}
        hint="The GSTIN printed on bills is set on the Hospital tab."
        testID="billing-receipt-footer"
      />
      <HStack gap={8} wrap>
        <Button
          label="Save tax and receipts"
          fullWidth={false}
          disabled={!changed}
          loading={update.isPending}
          onPress={submit}
          testID="billing-settings-save"
        />
      </HStack>
    </VStack>
  );
}

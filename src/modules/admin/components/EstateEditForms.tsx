import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Lock } from "lucide-react-native";

import { palette } from "@shared/designSystem";
import {
  Card,
  SectionHeader,
  VStack,
  HStack,
  Text,
  TextField,
  Select,
  Button,
  Banner,
} from "@shared/ui";
import { apiErrorCode, apiErrorMessage } from "@api/apiClient";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import {
  useUpdateBed,
  useUpdateRoom,
  useUpdateWard,
} from "@modules/admin/hooks/useAdmin";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import {
  ROOM_TYPE_LABELS,
  WARD_GENDER_LABELS,
  WARD_TYPE_LABELS,
  type Bed,
  type BedPatch,
  type Room,
  type RoomPatch,
  type RoomType,
  type Ward,
  type WardGender,
  type WardPatch,
  type WardType,
} from "@modules/admin/types";

export const WARD_TYPE_OPTIONS = (
  Object.keys(WARD_TYPE_LABELS) as WardType[]
).map((t) => ({
  value: t,
  label: WARD_TYPE_LABELS[t],
  sublabel:
    t === "icu" || t === "hdu" ? "Appears in the ICU workspace" : undefined,
}));
export const GENDER_OPTIONS = (
  Object.keys(WARD_GENDER_LABELS) as WardGender[]
).map((g) => ({
  value: g,
  label: WARD_GENDER_LABELS[g],
}));
export const ROOM_TYPE_OPTIONS = (
  Object.keys(ROOM_TYPE_LABELS) as RoomType[]
).map((t) => ({
  value: t,
  label: ROOM_TYPE_LABELS[t],
}));

/** "" means "not given", which the API reads as the model default. */
export function parseCharge(v: string): { value?: number; error?: string } {
  if (v.trim() === "") return {};
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000)
    return { error: "Between 0 and 10,00,000" };
  return { value: n };
}

/** A stored charge of 0 means "not set here", so it shows as a blank box. */
const chargeText = (n: number) => (n > 0 ? String(n) : "");

/** Keeps only what changed, so an untouched form sends nothing. */
function changes<T extends object>(next: T, before: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(next).filter(
      ([k, v]) => v !== undefined && v !== before[k as keyof T],
    ),
  ) as Partial<T>;
}

function occupiedMessage(err: unknown, what: string, fallback: string) {
  return apiErrorCode(err) === "BED_OCCUPIED"
    ? `A patient is in ${what}, so it stays in use. Transfer or discharge them first, then take it out of use. Your other changes were not saved either.`
    : apiErrorMessage(err, fallback);
}

// ---- Ward -------------------------------------------------------------------

export function WardEditForm({
  ward,
  onCancel,
  onSaved,
}: {
  ward: Ward;
  onCancel: () => void;
  onSaved: (w: Ward) => void;
}) {
  const update = useUpdateWard();
  const { data: departments = [] } = useDepartments();
  const [name, setName] = useState(ward.name);
  const [type, setType] = useState<WardType>(ward.type);
  const [gender, setGender] = useState<WardGender>(ward.gender);
  const [departmentId, setDepartmentId] = useState(ward.department?.id ?? "");
  const [floor, setFloor] = useState(ward.floor ?? "");
  const [charge, setCharge] = useState(chargeText(ward.dailyCharge));
  const [attempted, setAttempted] = useState(false);

  const parsed = parseCharge(charge);
  const errors = {
    name:
      name.trim().length < 2 || name.trim().length > 80
        ? "Between 2 and 80 characters"
        : undefined,
    floor: floor.trim().length > 20 ? "At most 20 characters" : undefined,
    charge: parsed.error,
  };
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    const patch: WardPatch = changes(
      {
        name: name.trim(),
        type,
        gender,
        floor: floor.trim(),
        dailyCharge: parsed.value ?? 0,
      },
      {
        name: ward.name,
        type: ward.type,
        gender: ward.gender,
        floor: ward.floor ?? "",
        dailyCharge: ward.dailyCharge,
      },
    );
    if (departmentId !== (ward.department?.id ?? ""))
      patch.departmentId = departmentId || null;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: ward.id, body: patch }, { onSuccess: onSaved });
  };

  return (
    <Card testID={`ward-edit-${ward.code}`}>
      <SectionHeader title={`Edit ${ward.name}`} subtitle={ward.code} />
      <VStack gap={12}>
        {update.isError ? (
          <View testID="ward-edit-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(update.error, "Could not save the ward")}
            />
          </View>
        ) : null}
        <FixedNote text="The ward code stays, because bed numbers and past admissions carry it." />
        <HStack gap={12} wrap>
          <TextField
            label="Name"
            required
            value={name}
            onChangeText={setName}
            error={show(errors.name)}
            containerStyle={{ flex: 2, minWidth: 220 }}
            testID="ward-edit-name"
          />
          <TextField
            label="Floor"
            value={floor}
            onChangeText={setFloor}
            error={show(errors.floor)}
            containerStyle={{ flex: 1, minWidth: 120 }}
            testID="ward-edit-floor"
          />
        </HStack>
        <HStack gap={12} wrap>
          <View style={{ flex: 1, minWidth: 200 }} testID="ward-edit-type">
            <Select
              label="Type"
              value={type}
              options={WARD_TYPE_OPTIONS}
              onChange={(v) => setType(v as WardType)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 200 }} testID="ward-edit-gender">
            <Select
              label="Who it takes"
              value={gender}
              options={GENDER_OPTIONS}
              onChange={(v) => setGender(v as WardGender)}
              hint="Applies to new admissions. Patients already in its beds stay where they are."
            />
          </View>
        </HStack>
        <HStack gap={12} wrap>
          <View
            style={{ flex: 2, minWidth: 220 }}
            testID="ward-edit-department"
          >
            <Select
              label="Department"
              value={departmentId}
              options={[
                { value: "", label: "No department" },
                ...departments.map((d) => ({
                  value: d.id,
                  label: d.name,
                  sublabel: d.code,
                })),
              ]}
              onChange={setDepartmentId}
            />
          </View>
          <TextField
            label="Daily charge"
            numericField
            suffix="₹"
            value={charge}
            onChangeText={setCharge}
            error={show(errors.charge)}
            hint="Used for any room or bed without its own charge. Bills already drawn up keep theirs."
            containerStyle={{ flex: 1, minWidth: 200 }}
            testID="ward-edit-charge"
          />
        </HStack>
        <HStack gap={8} wrap>
          <Button
            label="Save ward"
            fullWidth={false}
            loading={update.isPending}
            onPress={submit}
            testID="ward-edit-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="ward-edit-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

// ---- Room -------------------------------------------------------------------

export function RoomEditForm({
  room,
  onCancel,
  onSaved,
}: {
  room: Room;
  onCancel: () => void;
  onSaved: (r: Room) => void;
}) {
  const update = useUpdateRoom();
  const [type, setType] = useState<RoomType>(room.type);
  const [charge, setCharge] = useState(chargeText(room.dailyCharge));
  const [active, setActive] = useState(room.isActive);
  const parsed = parseCharge(charge);

  const submit = () => {
    if (parsed.error) return;
    const patch: RoomPatch = changes(
      { type, dailyCharge: parsed.value ?? 0, isActive: active },
      {
        type: room.type,
        dailyCharge: room.dailyCharge,
        isActive: room.isActive,
      },
    );
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: room.id, body: patch }, { onSuccess: onSaved });
  };

  return (
    <VStack gap={8} style={styles.subform} testID={`room-edit-${room.number}`}>
      <Text variant="label">Edit room {room.number}</Text>
      {update.isError ? (
        <View testID="room-edit-error">
          <Banner
            tone="danger"
            message={occupiedMessage(
              update.error,
              `one of room ${room.number}'s beds`,
              "Could not save the room",
            )}
          />
        </View>
      ) : null}
      <FixedNote
        text={`Room ${room.number} keeps its number, because its beds are named after it.`}
      />
      <HStack gap={8} wrap align="flex-start">
        <View style={{ flex: 1, minWidth: 180 }} testID="room-edit-type">
          <Select
            label="Room type"
            value={type}
            options={ROOM_TYPE_OPTIONS}
            onChange={(v) => setType(v as RoomType)}
          />
        </View>
        <TextField
          label="Daily charge"
          numericField
          suffix="₹"
          value={charge}
          onChangeText={setCharge}
          error={parsed.error}
          hint="Leave blank to use the ward's."
          containerStyle={{ width: 200 }}
          testID="room-edit-charge"
        />
      </HStack>
      <ToggleRow
        label="In use"
        description="Untick to take the room and its beds off the bed board and the admission picker."
        checked={active}
        onChange={setActive}
        testID="room-edit-active"
      />
      <HStack gap={8} wrap>
        <Button
          label="Save room"
          size="sm"
          fullWidth={false}
          disabled={Boolean(parsed.error)}
          loading={update.isPending}
          onPress={submit}
          testID="room-edit-submit"
        />
        <Button
          label="Cancel"
          size="sm"
          variant="ghost"
          fullWidth={false}
          onPress={onCancel}
          testID="room-edit-cancel"
        />
      </HStack>
    </VStack>
  );
}

// ---- Bed --------------------------------------------------------------------

export function BedEditForm({
  bed,
  onCancel,
  onSaved,
}: {
  bed: Bed;
  onCancel: () => void;
  onSaved: (b: Bed) => void;
}) {
  const update = useUpdateBed();
  const [charge, setCharge] = useState(chargeText(bed.dailyCharge));
  const [oxygen, setOxygen] = useState(bed.features.oxygen);
  const [ventilator, setVentilator] = useState(bed.features.ventilator);
  const [monitor, setMonitor] = useState(bed.features.monitor);
  const [active, setActive] = useState(bed.isActive);
  const parsed = parseCharge(charge);
  const occupied = bed.status === "occupied";

  const submit = () => {
    if (parsed.error) return;
    const patch: BedPatch = changes(
      {
        dailyCharge: parsed.value ?? 0,
        hasOxygen: oxygen,
        hasVentilator: ventilator,
        hasMonitor: monitor,
        isActive: active,
      },
      {
        dailyCharge: bed.dailyCharge,
        hasOxygen: bed.features.oxygen,
        hasVentilator: bed.features.ventilator,
        hasMonitor: bed.features.monitor,
        isActive: bed.isActive,
      },
    );
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: bed.id, body: patch }, { onSuccess: onSaved });
  };

  return (
    <VStack gap={8} style={styles.subform} testID={`bed-edit-${bed.number}`}>
      <Text variant="label">Edit bed {bed.number}</Text>
      {update.isError ? (
        <View testID="bed-edit-error">
          <Banner
            tone="danger"
            message={occupiedMessage(
              update.error,
              `bed ${bed.number}`,
              "Could not save the bed",
            )}
          />
        </View>
      ) : null}
      <FixedNote
        text={`Bed ${bed.number}. A bed's number stays, because admissions and transfers name it.`}
      />
      <TextField
        label="Daily charge"
        numericField
        suffix="₹"
        value={charge}
        onChangeText={setCharge}
        error={parsed.error}
        hint="Leave blank to use the room's charge, or the ward's."
        containerStyle={{ maxWidth: 260 }}
        testID="bed-edit-charge"
      />
      <HStack gap={4} wrap>
        <ToggleRow
          label="Oxygen"
          checked={oxygen}
          onChange={setOxygen}
          testID="bed-edit-oxygen"
        />
        <ToggleRow
          label="Ventilator"
          checked={ventilator}
          onChange={setVentilator}
          testID="bed-edit-ventilator"
        />
        <ToggleRow
          label="Monitor"
          checked={monitor}
          onChange={setMonitor}
          testID="bed-edit-monitor"
        />
      </HStack>
      <ToggleRow
        label="In use"
        description={
          occupied
            ? "A patient is in this bed. It can be taken out of use once they are transferred or discharged."
            : "Untick to take the bed off the bed board and the admission picker."
        }
        checked={active}
        onChange={setActive}
        testID="bed-edit-active"
      />
      <HStack gap={8} wrap>
        <Button
          label="Save bed"
          size="sm"
          fullWidth={false}
          disabled={Boolean(parsed.error)}
          loading={update.isPending}
          onPress={submit}
          testID="bed-edit-submit"
        />
        <Button
          label="Cancel"
          size="sm"
          variant="ghost"
          fullWidth={false}
          onPress={onCancel}
          testID="bed-edit-cancel"
        />
      </HStack>
    </VStack>
  );
}

function FixedNote({ text }: { text: string }) {
  return (
    <HStack gap={8} align="center">
      <Lock size={14} color={palette.text.tertiary} strokeWidth={2} />
      <Text variant="body-sm" tone="secondary" style={{ flex: 1 }}>
        {text}
      </Text>
    </HStack>
  );
}

const styles = StyleSheet.create({
  subform: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
});

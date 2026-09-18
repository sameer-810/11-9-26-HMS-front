import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import {
  BedDouble,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
} from "lucide-react-native";

import { bedState, palette, radius } from "@shared/designSystem";
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
  Skeleton,
  ErrorState,
  EmptyState,
  StatusChip,
  ConfirmDialog,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import { formatRupees } from "@shared/format";
import { useDepartments } from "@modules/appointment/hooks/useDirectory";
import {
  useAdminWards,
  useCreateWard,
  useSetWardActive,
  useRooms,
  useCreateRoom,
  useWardBeds,
  useCreateBedsBulk,
} from "@modules/admin/hooks/useAdmin";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import {
  BedEditForm,
  GENDER_OPTIONS,
  parseCharge,
  ROOM_TYPE_OPTIONS,
  RoomEditForm,
  WARD_TYPE_OPTIONS,
  WardEditForm,
} from "@modules/admin/components/EstateEditForms";
import {
  ROOM_TYPE_LABELS,
  WARD_GENDER_LABELS,
  WARD_TYPE_LABELS,
  type Bed,
  type BulkBedsResult,
  type Room,
  type RoomType,
  type Ward,
  type WardGender,
  type WardType,
} from "@modules/admin/types";

const CODE = /^[A-Z0-9-]{2,10}$/;

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/**
 * Ward -> room -> bed setup, in that order (a bed's ward comes from its room).
 * Beds are bulk-created by range; existing numbers are skipped.
 */
export function WardsPanel() {
  const {
    data: wards = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useAdminWards();
  const setActive = useSetWardActive();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Ward | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const toggleActive = (w: Ward, active: boolean) => {
    setNotice(null);
    setFailure(null);
    setActive.mutate(
      { id: w.id, active },
      {
        onSuccess: () =>
          setNotice(
            active
              ? `${w.name} is active again.`
              : `${w.name} is deactivated and its beds leave the board.`,
          ),
        onError: (e) =>
          setFailure(apiErrorMessage(e, `Could not change ${w.name}`)),
        onSettled: () => setConfirm(null),
      },
    );
  };

  return (
    <VStack gap={12} testID="wards-panel">
      <HStack gap={8} align="center" justify="space-between" wrap>
        <Text variant="body-sm" tone="tertiary">
          {wards.length} ward{wards.length === 1 ? "" : "s"}. Open one to add
          rooms and beds.
        </Text>
        {!creating ? (
          <Button
            label="Add ward"
            size="sm"
            fullWidth={false}
            icon={<Plus size={15} color="#FFFFFF" />}
            onPress={() => {
              setNotice(null);
              setCreating(true);
            }}
            testID="ward-create-open"
          />
        ) : null}
      </HStack>

      {failure ? (
        <View testID="ward-error">
          <Banner
            tone="danger"
            message={failure}
            onDismiss={() => setFailure(null)}
          />
        </View>
      ) : null}
      {notice ? (
        <View testID="ward-notice">
          <Banner tone="success" message={notice} />
        </View>
      ) : null}

      {creating ? (
        <WardCreateForm
          onCancel={() => setCreating(false)}
          onDone={(w) => {
            setCreating(false);
            setOpen(w.id);
            setNotice(
              `Ward "${w.name}" (${w.code}) added. Add its rooms below.`,
            );
          }}
        />
      ) : null}

      {isLoading ? (
        <VStack gap={8}>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </VStack>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : wards.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No wards yet"
          message="Add a ward, then its rooms, then the beds in each room."
        />
      ) : (
        <VStack gap={8}>
          {wards.map((w) => {
            const isOpen = open === w.id;
            if (editing === w.id)
              return (
                <WardEditForm
                  key={w.id}
                  ward={w}
                  onCancel={() => setEditing(null)}
                  onSaved={(saved) => {
                    setEditing(null);
                    setNotice(
                      `${saved.name} saved. New admissions and bills drawn up from now on use these details.`,
                    );
                  }}
                />
              );
            return (
              <Card key={w.id} compact testID={`ward-row-${w.code}`}>
                <VStack gap={10}>
                  <HStack gap={12} align="center" wrap>
                    <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
                      <HStack gap={8} align="center" wrap>
                        <Text variant="label-lg">{w.name}</Text>
                        <Text variant="caption" tone="tertiary">
                          {w.code}
                        </Text>
                        <StatusChip
                          status={w.isActive ? "active" : "inactive"}
                          size="sm"
                        />
                      </HStack>
                      <Text variant="body-sm" tone="secondary">
                        {WARD_TYPE_LABELS[w.type]} ·{" "}
                        {WARD_GENDER_LABELS[w.gender]}
                        {w.floor ? ` · floor ${w.floor}` : ""}
                        {w.department ? ` · ${w.department.name}` : ""} ·{" "}
                        <Text
                          variant="body-sm"
                          tone="secondary"
                          testID={`ward-charge-${w.code}`}
                        >
                          {formatRupees(w.dailyCharge)} a day
                        </Text>
                      </Text>
                    </VStack>
                    <HStack gap={6} wrap>
                      <Button
                        label="Edit"
                        size="xs"
                        variant="secondary"
                        fullWidth={false}
                        accessibilityHint={`Edit ${w.name}`}
                        icon={<Pencil size={13} color={palette.text.primary} />}
                        onPress={() => {
                          setNotice(null);
                          setFailure(null);
                          setEditing(w.id);
                        }}
                        testID={`ward-edit-open-${w.code}`}
                      />
                      <Button
                        label={isOpen ? "Close" : "Rooms and beds"}
                        size="xs"
                        variant="secondary"
                        fullWidth={false}
                        icon={
                          isOpen ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )
                        }
                        onPress={() => setOpen(isOpen ? null : w.id)}
                        testID={`ward-open-${w.code}`}
                      />
                      {w.isActive ? (
                        <Button
                          label="Deactivate"
                          size="xs"
                          variant="ghost"
                          fullWidth={false}
                          onPress={() => setConfirm(w)}
                          testID={`ward-deactivate-${w.code}`}
                        />
                      ) : (
                        <Button
                          label="Activate"
                          size="xs"
                          variant="ghost"
                          fullWidth={false}
                          loading={
                            setActive.isPending &&
                            setActive.variables?.id === w.id
                          }
                          onPress={() => toggleActive(w, true)}
                          testID={`ward-activate-${w.code}`}
                        />
                      )}
                    </HStack>
                  </HStack>
                  {isOpen ? <WardEstate ward={w} /> : null}
                </VStack>
              </Card>
            );
          })}
        </VStack>
      )}

      <ConfirmDialog
        visible={confirm !== null}
        title={`Deactivate ${confirm?.name ?? "this ward"}?`}
        message="Its beds leave the bed board and the admission picker. Check that nobody is admitted to it first — patients already in its beds stay admitted, but no one new can be placed there."
        confirmLabel="Yes, deactivate"
        destructive
        loading={setActive.isPending}
        onConfirm={() => confirm && toggleActive(confirm, false)}
        onCancel={() => setConfirm(null)}
      />
    </VStack>
  );
}

function WardCreateForm({
  onDone,
  onCancel,
}: {
  onDone: (w: Ward) => void;
  onCancel: () => void;
}) {
  const create = useCreateWard();
  const { data: departments = [] } = useDepartments();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<WardType>("general");
  const [gender, setGender] = useState<WardGender>("mixed");
  const [departmentId, setDepartmentId] = useState("");
  const [floor, setFloor] = useState("");
  const [charge, setCharge] = useState("");
  const [attempted, setAttempted] = useState(false);

  const parsed = parseCharge(charge);
  const errors = {
    name: name.trim().length < 2 ? "At least 2 characters" : undefined,
    code: !CODE.test(code.trim())
      ? "2–10 letters, digits or hyphens"
      : undefined,
    floor: floor.trim().length > 20 ? "At most 20 characters" : undefined,
    charge: parsed.error,
  };
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (Object.values(errors).some(Boolean)) return;
    create.mutate(
      {
        name: name.trim(),
        code: code.trim(),
        type,
        gender,
        floor: floor.trim() || undefined,
        dailyCharge: parsed.value,
        departmentId: departmentId || undefined,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <Card testID="ward-create">
      <SectionHeader title="New ward" />
      <VStack gap={12}>
        {create.isError ? (
          <View testID="ward-create-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(create.error, "Could not add the ward")}
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
            testID="ward-create-name"
          />
          <TextField
            label="Code"
            required
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={10}
            error={show(errors.code)}
            containerStyle={{ flex: 1, minWidth: 160 }}
            testID="ward-create-code"
          />
        </HStack>
        <HStack gap={12} wrap>
          <View style={{ flex: 1, minWidth: 200 }} testID="ward-create-type">
            <Select
              label="Type"
              value={type}
              options={WARD_TYPE_OPTIONS}
              onChange={(v) => setType(v as WardType)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 200 }} testID="ward-create-gender">
            <Select
              label="Who it takes"
              value={gender}
              options={GENDER_OPTIONS}
              onChange={(v) => setGender(v as WardGender)}
              hint="The admission picker refuses a bed in a single-sex ward for the other sex."
            />
          </View>
        </HStack>
        <HStack gap={12} wrap>
          <View
            style={{ flex: 2, minWidth: 220 }}
            testID="ward-create-department"
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
            label="Floor"
            value={floor}
            onChangeText={setFloor}
            error={show(errors.floor)}
            containerStyle={{ flex: 1, minWidth: 120 }}
            testID="ward-create-floor"
          />
          <TextField
            label="Daily charge"
            numericField
            suffix="₹"
            value={charge}
            onChangeText={setCharge}
            error={show(errors.charge)}
            containerStyle={{ flex: 1, minWidth: 160 }}
            testID="ward-create-charge"
          />
        </HStack>
        <HStack gap={8} wrap>
          <Button
            label="Add ward"
            fullWidth={false}
            loading={create.isPending}
            onPress={submit}
            testID="ward-create-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="ward-create-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

function WardEstate({ ward }: { ward: Ward }) {
  const rooms = useRooms(ward.id);
  const beds = useWardBeds(ward.id);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const bedsByRoom = useMemo(() => {
    const map = new Map<string, Bed[]>();
    for (const b of beds.data ?? []) {
      const key = b.room?.id ?? "";
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    for (const list of map.values())
      list.sort((a, b) => natural(a.number, b.number));
    return map;
  }, [beds.data]);

  const roomList = [...(rooms.data ?? [])].sort((a, b) =>
    natural(a.number, b.number),
  );

  return (
    <VStack gap={10} style={styles.estate} testID={`ward-estate-${ward.code}`}>
      {rooms.isLoading ? (
        <Skeleton height={48} />
      ) : rooms.isError ? (
        <ErrorState error={rooms.error} onRetry={rooms.refetch} />
      ) : roomList.length === 0 ? (
        <Text variant="body-sm" tone="tertiary">
          No rooms in this ward yet. Beds are added to a room.
        </Text>
      ) : (
        roomList.map((room) => (
          <RoomBlock
            key={room.id}
            ward={ward}
            room={room}
            beds={bedsByRoom.get(room.id) ?? []}
            adding={addingTo === room.id}
            onToggleAdding={() =>
              setAddingTo(addingTo === room.id ? null : room.id)
            }
          />
        ))
      )}
      <RoomCreateForm ward={ward} />
    </VStack>
  );
}

function RoomBlock({
  ward,
  room,
  beds,
  adding,
  onToggleAdding,
}: {
  ward: Ward;
  room: Room;
  beds: Bed[];
  adding: boolean;
  onToggleAdding: () => void;
}) {
  const [editingRoom, setEditingRoom] = useState(false);
  const [editingBed, setEditingBed] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const bed = beds.find((b) => b.id === editingBed);

  return (
    <VStack
      gap={8}
      style={styles.room}
      testID={`room-row-${ward.code}-${room.number}`}
    >
      <HStack gap={8} align="center" wrap>
        <VStack gap={1} style={{ flex: 1, minWidth: 180 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label">Room {room.number}</Text>
            {!room.isActive ? (
              <StatusChip status="inactive" size="sm" />
            ) : null}
          </HStack>
          <Text
            variant="caption"
            tone="tertiary"
            testID={`room-summary-${ward.code}-${room.number}`}
          >
            {ROOM_TYPE_LABELS[room.type]} · {beds.length} bed
            {beds.length === 1 ? "" : "s"}
            {room.dailyCharge
              ? ` · ${formatRupees(room.dailyCharge)} a day`
              : ""}
          </Text>
        </VStack>
        <HStack gap={6} wrap>
          <Button
            label={editingRoom ? "Close" : "Edit room"}
            size="xs"
            variant="ghost"
            fullWidth={false}
            accessibilityHint={`Change room ${room.number}'s type, charge or whether it is in use`}
            onPress={() => {
              setSaved(null);
              setEditingRoom(!editingRoom);
            }}
            testID={`room-edit-open-${ward.code}-${room.number}`}
          />
          <Button
            label={adding ? "Close" : "Add beds"}
            size="xs"
            variant="secondary"
            fullWidth={false}
            onPress={onToggleAdding}
            testID={`room-add-beds-${ward.code}-${room.number}`}
          />
        </HStack>
      </HStack>
      {saved ? (
        <View testID={`room-saved-${ward.code}-${room.number}`}>
          <Banner
            tone="success"
            message={saved}
            onDismiss={() => setSaved(null)}
          />
        </View>
      ) : null}
      {editingRoom ? (
        <RoomEditForm
          room={room}
          onCancel={() => setEditingRoom(false)}
          onSaved={(r) => {
            setEditingRoom(false);
            setSaved(
              `Room ${r.number} saved. Bills drawn up from now on use its charge.`,
            );
          }}
        />
      ) : null}
      {beds.length > 0 ? (
        <>
          <HStack gap={6} wrap>
            {beds.map((b) => {
              const s = bedState[b.status];
              const kit = [
                b.features.oxygen && "O₂",
                b.features.ventilator && "vent",
                b.features.monitor && "mon",
              ]
                .filter(Boolean)
                .join(" ");
              const selected = editingBed === b.id;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setSaved(null);
                    setEditingBed(selected ? null : b.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Bed ${b.number}, ${s.label}${b.isActive ? "" : ", out of use"}`}
                  accessibilityHint="Edit this bed's charge, equipment or whether it is in use"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.bedChip,
                    { backgroundColor: s.bg, borderColor: s.border },
                    selected ? styles.bedChipSelected : null,
                    !b.isActive ? styles.bedChipInactive : null,
                    pressed ? { opacity: 0.75 } : null,
                  ]}
                  testID={`config-bed-${ward.code}-${b.number}`}
                >
                  <Text variant="label-sm" style={{ color: s.color }} tabular>
                    {b.number}
                  </Text>
                  {kit ? (
                    <Text variant="caption" tone="tertiary">
                      {kit}
                    </Text>
                  ) : null}
                  {b.dailyCharge > 0 ? (
                    <Text variant="caption" tone="tertiary" tabular>
                      {formatRupees(b.dailyCharge)}
                    </Text>
                  ) : null}
                  {!b.isActive ? (
                    <Text variant="caption" tone="tertiary">
                      out of use
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </HStack>
          {bed ? (
            <BedEditForm
              key={bed.id}
              bed={bed}
              onCancel={() => setEditingBed(null)}
              onSaved={(b) => {
                setEditingBed(null);
                setSaved(
                  `Bed ${b.number} saved. Bills drawn up from now on use its charge.`,
                );
              }}
            />
          ) : (
            <Text variant="caption" tone="tertiary">
              Choose a bed to change its charge, equipment or whether it is in
              use.
            </Text>
          )}
        </>
      ) : null}
      {adding ? <BulkBedsForm room={room} /> : null}
    </VStack>
  );
}

function RoomCreateForm({ ward }: { ward: Ward }) {
  const create = useCreateRoom();
  const [number, setNumber] = useState("");
  const [type, setType] = useState<RoomType>("general");
  const [charge, setCharge] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const parsed = parseCharge(charge);
  const ready =
    number.trim().length >= 1 && number.trim().length <= 20 && !parsed.error;

  return (
    <VStack gap={8} style={styles.subform} testID={`room-create-${ward.code}`}>
      <Text variant="label">Add a room to {ward.name}</Text>
      {create.isError ? (
        <View testID="room-create-error">
          <Banner
            tone="danger"
            message={apiErrorMessage(create.error, "Could not add the room")}
          />
        </View>
      ) : null}
      {added ? (
        <View testID="room-create-notice">
          <Banner
            tone="success"
            message={`Room ${added} added. Use "Add beds" on it next.`}
          />
        </View>
      ) : null}
      <HStack gap={8} wrap align="flex-start">
        <TextField
          label="Room number"
          value={number}
          onChangeText={setNumber}
          maxLength={20}
          containerStyle={{ width: 140 }}
          testID="room-create-number"
        />
        <View style={{ flex: 1, minWidth: 180 }} testID="room-create-type">
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
          containerStyle={{ width: 160 }}
          testID="room-create-charge"
        />
      </HStack>
      <Button
        label="Add room"
        size="sm"
        fullWidth={false}
        disabled={!ready}
        loading={create.isPending}
        onPress={() => {
          setAdded(null);
          create.mutate(
            {
              wardId: ward.id,
              number: number.trim(),
              type,
              dailyCharge: parsed.value,
            },
            {
              onSuccess: (room) => {
                setAdded(room.number);
                setNumber("");
                setCharge("");
              },
            },
          );
        }}
        testID="room-create-submit"
      />
    </VStack>
  );
}

function BulkBedsForm({ room }: { room: Room }) {
  const bulk = useCreateBedsBulk();
  const [prefix, setPrefix] = useState("");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [charge, setCharge] = useState("");
  const [oxygen, setOxygen] = useState(false);
  const [ventilator, setVentilator] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [result, setResult] = useState<BulkBedsResult | null>(null);

  const f = Number(from);
  const t = Number(to);
  const whole = (n: number) => Number.isInteger(n) && n >= 1 && n <= 9999;
  // The same three rules as createBedsBulkSchema, including its 200-bed cap.
  const rangeError =
    from.trim() === "" || to.trim() === ""
      ? undefined
      : !whole(f) || !whole(t)
        ? "Whole numbers from 1 to 9999"
        : t < f
          ? "The last number must not be lower than the first"
          : t - f >= 200
            ? "Add at most 200 beds at a time"
            : undefined;
  const parsed = parseCharge(charge);
  const ready =
    from.trim() !== "" &&
    to.trim() !== "" &&
    !rangeError &&
    !parsed.error &&
    prefix.trim().length <= 10;
  const p = prefix.trim();

  return (
    <VStack gap={8} style={styles.subform} testID={`beds-bulk-${room.number}`}>
      <Text variant="label">Add beds to room {room.number}</Text>
      {bulk.isError ? (
        <View testID="beds-bulk-error">
          <Banner
            tone="danger"
            message={apiErrorMessage(bulk.error, "Could not add the beds")}
          />
        </View>
      ) : null}
      {result ? (
        <View testID="beds-bulk-result">
          <Banner
            tone={result.created > 0 ? "success" : "info"}
            message={`${result.message}${result.created > 0 && result.skipped > 0 ? ` — ${result.skipped} already existed and were skipped` : ""}.`}
          />
        </View>
      ) : null}
      <HStack gap={8} wrap align="flex-start">
        <TextField
          label="Prefix"
          placeholder="B"
          value={prefix}
          onChangeText={setPrefix}
          maxLength={10}
          containerStyle={{ width: 110 }}
          testID="beds-bulk-prefix"
        />
        <TextField
          label="From"
          numericField
          value={from}
          onChangeText={setFrom}
          containerStyle={{ width: 100 }}
          testID="beds-bulk-from"
        />
        <TextField
          label="To"
          numericField
          value={to}
          onChangeText={setTo}
          error={rangeError}
          containerStyle={{ width: 160 }}
          testID="beds-bulk-to"
        />
        <TextField
          label="Daily charge"
          numericField
          suffix="₹"
          value={charge}
          onChangeText={setCharge}
          error={parsed.error}
          hint="Leave blank to use the ward's."
          containerStyle={{ width: 180 }}
          testID="beds-bulk-charge"
        />
      </HStack>
      <HStack gap={4} wrap>
        <ToggleRow
          label="Oxygen"
          checked={oxygen}
          onChange={setOxygen}
          testID="beds-bulk-oxygen"
        />
        <ToggleRow
          label="Ventilator"
          checked={ventilator}
          onChange={setVentilator}
          testID="beds-bulk-ventilator"
        />
        <ToggleRow
          label="Monitor"
          checked={monitor}
          onChange={setMonitor}
          testID="beds-bulk-monitor"
        />
      </HStack>
      {ready ? (
        <Text variant="caption" tone="tertiary" testID="beds-bulk-preview">
          Creates {p}
          {f} to {p}
          {t} — {t - f + 1} bed{t - f === 0 ? "" : "s"}. Numbers that already
          exist in this room are skipped.
        </Text>
      ) : null}
      <Button
        label="Add beds"
        size="sm"
        fullWidth={false}
        disabled={!ready}
        loading={bulk.isPending}
        onPress={() => {
          setResult(null);
          bulk.mutate(
            {
              roomId: room.id,
              prefix: p || undefined,
              from: f,
              to: t,
              dailyCharge: parsed.value,
              hasOxygen: oxygen,
              hasVentilator: ventilator,
              hasMonitor: monitor,
            },
            { onSuccess: setResult },
          );
        }}
        testID="beds-bulk-submit"
      />
    </VStack>
  );
}

const styles = StyleSheet.create({
  estate: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
  room: {
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.subtle,
    backgroundColor: palette.surface.secondary,
  },
  subform: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
  bedChip: {
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  bedChipSelected: { borderWidth: 2, borderColor: palette.border.focus },
  bedChipInactive: { opacity: 0.6, borderStyle: "dashed" },
});

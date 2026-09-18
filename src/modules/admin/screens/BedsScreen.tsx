import React, { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { BedDouble } from "lucide-react-native";

import { bedState, palette, radius } from "@shared/designSystem";
import { useAuthStore } from "@shared/store/useAuthStore";
import { PERMISSIONS } from "@shared/permissions";
import {
  Screen,
  Text,
  VStack,
  HStack,
  Card,
  ChipsRow,
  TextField,
  Button,
  Banner,
  Skeleton,
  ErrorState,
  EmptyState,
  StatTile,
} from "@shared/ui";
import { apiErrorMessage } from "@api/apiClient";
import {
  useAllBeds,
  useBedBoardCounts,
  useSetBedStatus,
} from "@modules/admin/hooks/useAdmin";
import {
  WARD_TYPE_LABELS,
  type Bed,
  type BedCounts,
  type BedStatus,
  type WardType,
} from "@modules/admin/types";

type Filter = "all" | BedStatus;
/** Which change the panel under a ward is making. */
type BedAction = "maintenance" | "reserve";

interface WardGroup {
  id: string;
  name: string;
  code: string;
  type: WardType;
  beds: Bed[];
  counts: BedCounts;
}

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

function countOf(beds: Bed[]): BedCounts {
  const c: BedCounts = {
    available: 0,
    occupied: 0,
    reserved: 0,
    maintenance: 0,
    total: beds.length,
  };
  for (const b of beds) c[b.status] += 1;
  return c;
}

/**
 * Bed management (IP-02). Shows no patient: reachable with beds.view alone, so the
 * occupant id is never followed. Manual changes are out of service and back, and reserve and release.
 */
export default function BedsScreen() {
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  // mirrors the ward routes: PATCH /beds/:id/status takes either grant
  const canManage = hasAnyPermission(
    PERMISSIONS.BEDS_MANAGE,
    PERMISSIONS.HOSPITAL_CONFIG,
  );

  const beds = useAllBeds();
  const board = useBedBoardCounts();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<BedAction>("maintenance");
  const [notice, setNotice] = useState<string | null>(null);

  const active = useMemo(
    () => (beds.data ?? []).filter((b) => b.isActive),
    [beds.data],
  );
  // looked up from the fresh list each render so a just-admitted bed is not acted on from a stale copy
  const selected = active.find((b) => b.id === selectedId) ?? null;

  const groups = useMemo<WardGroup[]>(() => {
    const byWard = new Map<string, Bed[]>();
    for (const b of active) {
      const key = b.ward?.id ?? "";
      byWard.set(key, [...(byWard.get(key) ?? []), b]);
    }
    const sortBeds = (list: Bed[]) =>
      [...list].sort(
        (a, b) =>
          natural(a.room?.number ?? "", b.room?.number ?? "") ||
          natural(a.number, b.number),
      );

    // the board fixes the ward order and includes wards with no beds yet
    const out: WardGroup[] = (board.data?.wards ?? []).map((w) => {
      const list = sortBeds(byWard.get(w.wardId) ?? []);
      return {
        id: w.wardId,
        name: w.name,
        code: w.code,
        type: w.type,
        beds: list,
        counts: countOf(list),
      };
    });
    for (const [id, list] of byWard) {
      if (out.some((g) => g.id === id)) continue;
      const ward = list[0]?.ward;
      out.push({
        id,
        name: ward?.name ?? "Unassigned",
        code: ward?.code ?? "NONE",
        type: ward?.type ?? "general",
        beds: sortBeds(list),
        counts: countOf(list),
      });
    }
    return out;
  }, [active, board.data]);

  const totals = countOf(active);
  const occupancy = totals.total
    ? Math.round((totals.occupied / totals.total) * 100)
    : 0;

  const chips = [
    { key: "all", label: "All beds", count: totals.total },
    ...(Object.keys(bedState) as BedStatus[]).map((s) => ({
      key: s,
      label: bedState[s].label,
      count: totals[s],
    })),
  ];

  return (
    <Screen
      overline="Wards"
      title="Bed management"
      subtitle="Every bed, by ward. Refreshes every minute."
      refreshing={beds.isRefetching}
      onRefresh={() => {
        beds.refetch();
        board.refetch();
      }}
      testID="beds-screen"
    >
      <VStack gap={14}>
        <HStack gap={10} wrap>
          <StatTile
            label="Available"
            value={totals.available}
            icon={BedDouble}
            accent="green"
          />
          <StatTile
            label="Occupied"
            value={totals.occupied}
            sublabel={`${occupancy}% occupancy`}
            accent="clinical"
          />
          <StatTile label="Reserved" value={totals.reserved} accent="amber" />
          <StatTile
            label="Out of service"
            value={totals.maintenance}
            attention={totals.maintenance > 0}
          />
        </HStack>

        <ChipsRow
          chips={chips}
          active={filter}
          onChange={(k) => setFilter(k as Filter)}
        />

        {notice ? (
          <View testID="beds-notice">
            <Banner
              tone="success"
              message={notice}
              onDismiss={() => setNotice(null)}
            />
          </View>
        ) : null}
        {canManage ? (
          <Text variant="caption" tone="tertiary">
            Occupied beds change only through admission, transfer and discharge.
          </Text>
        ) : null}

        {beds.isLoading ? (
          <VStack gap={10}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </VStack>
        ) : beds.isError ? (
          <ErrorState error={beds.error} onRetry={beds.refetch} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No beds yet"
            message="Wards, rooms and beds are set up under Hospital setup."
          />
        ) : (
          <VStack gap={12}>
            {groups.map((g) => {
              const shown =
                filter === "all"
                  ? g.beds
                  : g.beds.filter((b) => b.status === filter);
              if (filter !== "all" && shown.length === 0) return null;
              return (
                <Card key={g.id} testID={`beds-ward-${g.code}`}>
                  <VStack gap={10}>
                    <HStack gap={8} align="center" justify="space-between" wrap>
                      <VStack gap={1}>
                        <HStack gap={8} align="center">
                          <Text variant="h3">{g.name}</Text>
                          <Text variant="caption" tone="tertiary">
                            {g.code} · {WARD_TYPE_LABELS[g.type] ?? g.type}
                          </Text>
                        </HStack>
                      </VStack>
                      <Text
                        variant="body-sm"
                        tone="secondary"
                        tabular
                        testID={`beds-ward-counts-${g.code}`}
                      >
                        {g.counts.available} available · {g.counts.occupied}{" "}
                        occupied · {g.counts.reserved} reserved ·{" "}
                        {g.counts.maintenance} out of service · {g.counts.total}{" "}
                        total
                      </Text>
                    </HStack>

                    {g.beds.length === 0 ? (
                      <Text variant="body-sm" tone="tertiary">
                        No beds in this ward yet.
                      </Text>
                    ) : (
                      <HStack gap={8} wrap>
                        {shown.map((b) => (
                          <BedTile
                            key={b.id}
                            bed={b}
                            wardCode={g.code}
                            canManage={canManage}
                            selected={selected?.id === b.id}
                            onAction={(next) => {
                              setNotice(null);
                              setAction(next);
                              setSelectedId(b.id);
                            }}
                            onClose={() => setSelectedId(null)}
                          />
                        ))}
                      </HStack>
                    )}

                    {selected && selected.ward?.id === g.id && canManage ? (
                      action === "reserve" ? (
                        <ReservePanel
                          key={`${selected.id}-${selected.status}-reserve`}
                          bed={selected}
                          onCancel={() => setSelectedId(null)}
                          onDone={(message) => {
                            setSelectedId(null);
                            setNotice(message);
                          }}
                        />
                      ) : (
                        <MaintenancePanel
                          key={`${selected.id}-${selected.status}`}
                          bed={selected}
                          onCancel={() => setSelectedId(null)}
                          onDone={(message) => {
                            setSelectedId(null);
                            setNotice(message);
                          }}
                        />
                      )
                    ) : null}
                  </VStack>
                </Card>
              );
            })}
          </VStack>
        )}
      </VStack>
    </Screen>
  );
}

function BedTile({
  bed,
  wardCode,
  canManage,
  selected,
  onAction,
  onClose,
}: {
  bed: Bed;
  wardCode: string;
  canManage: boolean;
  selected: boolean;
  onAction: (action: BedAction) => void;
  onClose: () => void;
}) {
  const s = bedState[bed.status];
  const kit = [
    bed.features.oxygen && "Oxygen",
    bed.features.ventilator && "Ventilator",
    bed.features.monitor && "Monitor",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      testID={`bed-${wardCode}-${bed.number}`}
      accessibilityLabel={`Bed ${bed.number}${bed.room ? `, room ${bed.room.number}` : ""}, ${s.label}`}
      style={[
        styles.tile,
        {
          backgroundColor: s.bg,
          borderColor: selected ? palette.border.focus : s.border,
        },
        selected ? styles.tileSelected : null,
      ]}
    >
      <HStack gap={6} align="center" justify="space-between">
        <Text variant="label-lg" tabular>
          {bed.number}
        </Text>
        {bed.room ? (
          <Text variant="caption" tone="tertiary">
            Room {bed.room.number}
          </Text>
        ) : null}
      </HStack>

      <Text
        variant="label-sm"
        style={{ color: s.color }}
        testID={`bed-status-${bed.id}`}
      >
        {s.label}
      </Text>
      {(bed.status === "maintenance" || bed.status === "reserved") &&
      bed.maintenanceNote ? (
        <Text
          variant="caption"
          tone="secondary"
          numberOfLines={2}
          testID={`bed-note-${bed.id}`}
        >
          {bed.status === "reserved"
            ? `Held for: ${bed.maintenanceNote}`
            : bed.maintenanceNote}
        </Text>
      ) : null}
      {kit ? (
        <Text variant="caption" tone="tertiary" numberOfLines={1}>
          {kit}
        </Text>
      ) : null}
      {canManage && bed.status !== "occupied" ? (
        selected ? (
          <Button
            label="Close"
            size="xs"
            variant="secondary"
            onPress={onClose}
            testID={`bed-close-${bed.id}`}
          />
        ) : (
          <VStack gap={4}>
            {bed.status === "available" || bed.status === "reserved" ? (
              <Button
                label={bed.status === "reserved" ? "Release" : "Reserve"}
                size="xs"
                variant="secondary"
                onPress={() => onAction("reserve")}
                accessibilityHint={
                  bed.status === "reserved"
                    ? `Makes bed ${bed.number} available again`
                    : `Holds bed ${bed.number} so it cannot be chosen for another patient`
                }
                testID={`bed-${bed.status === "reserved" ? "release" : "reserve"}-${bed.id}`}
              />
            ) : null}
            <Button
              label={
                bed.status === "maintenance"
                  ? "Return to service"
                  : "Out of service"
              }
              size="xs"
              variant="secondary"
              onPress={() => onAction("maintenance")}
              testID={`bed-maintenance-${bed.id}`}
            />
          </VStack>
        )
      ) : null}
    </View>
  );
}

function MaintenancePanel({
  bed,
  onDone,
  onCancel,
}: {
  bed: Bed;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const setStatus = useSetBedStatus();
  const [note, setNote] = useState("");
  const takingOut = bed.status !== "maintenance";
  const noteOk = note.trim().length >= 5 && note.trim().length <= 200;

  const submit = () =>
    setStatus.mutate(
      {
        id: bed.id,
        status: takingOut ? "maintenance" : "available",
        maintenanceNote: takingOut ? note.trim() : undefined,
      },
      {
        onSuccess: () =>
          onDone(
            takingOut
              ? `Bed ${bed.number} is out of service.`
              : `Bed ${bed.number} is back in service.`,
          ),
      },
    );

  return (
    <VStack gap={8} style={styles.panel} testID="bed-maintenance-panel">
      <Text variant="label">
        {takingOut
          ? `Take bed ${bed.number} out of service`
          : `Return bed ${bed.number} to service`}
      </Text>
      {setStatus.isError ? (
        <View testID="bed-maintenance-error">
          <Banner
            tone="danger"
            message={apiErrorMessage(
              setStatus.error,
              "Could not change the bed",
            )}
          />
        </View>
      ) : null}
      {takingOut ? (
        <TextField
          label="Why is it out of service?"
          required
          placeholder="Broken bed rail, deep clean after isolation"
          value={note}
          onChangeText={setNote}
          maxLength={200}
          hint="Shown on the bed until it is returned. At least 5 characters."
          testID="bed-maintenance-note"
        />
      ) : (
        <Text variant="body-sm" tone="secondary">
          {bed.maintenanceNote
            ? `Out of service: ${bed.maintenanceNote}`
            : "Out of service, no reason recorded."}{" "}
          It becomes available for admission straight away.
        </Text>
      )}
      <HStack gap={8} wrap>
        <Button
          label={takingOut ? "Take out of service" : "Return to service"}
          size="sm"
          fullWidth={false}
          variant={takingOut ? "destructive" : "primary"}
          disabled={takingOut && !noteOk}
          loading={setStatus.isPending}
          onPress={submit}
          testID="bed-maintenance-submit"
        />
        <Button
          label="Cancel"
          size="sm"
          variant="ghost"
          fullWidth={false}
          onPress={onCancel}
          testID="bed-maintenance-cancel"
        />
      </HStack>
    </VStack>
  );
}

/** Reserve an available bed, or release a reserved one. Nothing about the patient is recorded here. */
function ReservePanel({
  bed,
  onDone,
  onCancel,
}: {
  bed: Bed;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const setStatus = useSetBedStatus();
  const [note, setNote] = useState("");
  const reserving = bed.status === "available";
  const noteOk = note.trim().length >= 3 && note.trim().length <= 200;

  const submit = () =>
    setStatus.mutate(
      {
        id: bed.id,
        status: reserving ? "reserved" : "available",
        maintenanceNote: reserving ? note.trim() : undefined,
      },
      {
        onSuccess: () =>
          onDone(
            reserving
              ? `Bed ${bed.number} is reserved.`
              : `Bed ${bed.number} is released and available.`,
          ),
      },
    );

  return (
    <VStack gap={8} style={styles.panel} testID="bed-reserve-panel">
      <Text variant="label">
        {reserving ? `Reserve bed ${bed.number}` : `Release bed ${bed.number}`}
      </Text>
      {setStatus.isError ? (
        <View testID="bed-reserve-error">
          <Banner
            tone="danger"
            message={apiErrorMessage(
              setStatus.error,
              "Could not change the bed",
            )}
          />
        </View>
      ) : null}
      {reserving ? (
        <TextField
          label="What is it held for?"
          required
          placeholder="Post-op from theatre 2, transfer from ICU"
          value={note}
          onChangeText={setNote}
          maxLength={200}
          hint="No patient names: the bed board is seen by staff who cannot open records. At least 3 characters."
          testID="bed-reserve-note"
        />
      ) : bed.maintenanceNote ? (
        <Text variant="body-sm" tone="secondary">
          Held for: {bed.maintenanceNote}
        </Text>
      ) : null}
      <Text variant="body-sm" tone="secondary">
        {reserving
          ? "A reserved bed is greyed out on the admit and transfer lists, so nobody else is put in it, until it is released."
          : "It becomes available for admission and transfer straight away."}
      </Text>
      <HStack gap={8} wrap>
        <Button
          label={reserving ? "Reserve bed" : "Release bed"}
          size="sm"
          fullWidth={false}
          disabled={reserving && !noteOk}
          loading={setStatus.isPending}
          onPress={submit}
          testID={reserving ? "bed-reserve-submit" : "bed-release-submit"}
        />
        <Button
          label="Cancel"
          size="sm"
          variant="ghost"
          fullWidth={false}
          onPress={onCancel}
          testID="bed-reserve-cancel"
        />
      </HStack>
    </VStack>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 156,
    gap: 4,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  tileSelected: { borderWidth: 2 },
  panel: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border.subtle,
  },
});

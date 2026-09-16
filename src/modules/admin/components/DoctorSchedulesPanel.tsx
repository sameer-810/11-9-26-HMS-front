import React, { useState } from "react";
import { View } from "react-native";
import { CalendarClock, CalendarOff, Plus } from "lucide-react-native";

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
import { formatCalendarDate, formatWallTime, shortDate } from "@shared/format";
import { useDoctors } from "@modules/appointment/hooks/useDirectory";
import {
  useClinicSessions,
  useCreateClinicSessions,
  useCreateScheduleException,
  useHospitalProfile,
  useRemoveScheduleException,
  useScheduleExceptions,
  useUpdateClinicSession,
} from "@modules/admin/hooks/useAdmin";
import { ToggleRow } from "@modules/admin/components/ToggleRow";
import { TabChips } from "@modules/admin/components/TabChips";
import {
  WALL_TIME_RE,
  calendarDateInZone,
  isCalendarDate,
  todayInZone,
  zoneMidnight,
} from "@modules/admin/hospitalTime";
import type {
  ClinicSession,
  ClinicSessionPatch,
  CreatedScheduleException,
  ScheduleException,
  ScheduleExceptionType,
} from "@modules/admin/types";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const EXCEPTION_LABELS: Record<ScheduleExceptionType, string> = {
  leave: "Leave",
  blocked: "Blocked time",
  extra: "Extra clinic",
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function wholeNumber(value: string, min: number, max: number) {
  const n = Number(value);
  return /^\d+$/.test(value.trim()) && n >= min && n <= max;
}

/** Shared by the session and exception forms: both times valid, end after start. */
function timeErrors(start: string, end: string) {
  const startOk = WALL_TIME_RE.test(start.trim());
  const endOk = WALL_TIME_RE.test(end.trim());
  return {
    start: startOk ? undefined : "24-hour time, such as 09:00",
    end: !endOk
      ? "24-hour time, such as 13:00"
      : startOk && end.trim() <= start.trim()
        ? "Must be after the start"
        : undefined,
  };
}

/**
 * Weekly clinic sessions and one-off leave or extra clinics, per doctor. Reception's
 * booking screen derives every slot from these, so each change refetches availability.
 */
export function DoctorSchedulesPanel() {
  const doctors = useDoctors();
  const hospital = useHospitalProfile();
  const [doctorId, setDoctorId] = useState<string | null>(null);

  const timeZone = hospital.data?.timezone || "Asia/Kolkata";
  const doctor = doctors.data?.find((d) => d.id === doctorId);

  return (
    <VStack gap={12} testID="schedules-panel">
      <Card>
        <View style={{ maxWidth: 420 }} testID="schedule-doctor">
          <Select
            label="Doctor"
            value={doctorId}
            placeholder={
              doctors.isLoading ? "Loading doctors…" : "Choose a doctor"
            }
            options={(doctors.data ?? []).map((d) => ({
              value: d.id,
              label: d.fullName,
              sublabel: d.specialization || d.designation,
            }))}
            onChange={setDoctorId}
            hint={`Times are on the hospital clock (${timeZone}).`}
          />
        </View>
      </Card>

      {doctors.isError ? (
        <ErrorState error={doctors.error} onRetry={doctors.refetch} />
      ) : !doctorId || !doctor ? (
        <EmptyState
          icon={CalendarClock}
          title="Choose a doctor"
          message={
            doctors.data?.length === 0
              ? "No active doctors yet. Add them under Users & access."
              : "Their weekly clinics and leave decide which slots reception can book."
          }
        />
      ) : (
        // Keyed so switching doctor starts every form afresh.
        <DoctorSchedule
          key={doctorId}
          doctorId={doctorId}
          doctorName={doctor.fullName}
          timeZone={timeZone}
        />
      )}
    </VStack>
  );
}

function DoctorSchedule({
  doctorId,
  doctorName,
  timeZone,
}: {
  doctorId: string;
  doctorName: string;
  timeZone: string;
}) {
  return (
    <VStack gap={12}>
      <WeeklySessions
        doctorId={doctorId}
        doctorName={doctorName}
        timeZone={timeZone}
      />
      <LeaveAndExtras
        doctorId={doctorId}
        doctorName={doctorName}
        timeZone={timeZone}
      />
    </VStack>
  );
}

// ---- Weekly sessions --------------------------------------------------------

function WeeklySessions({
  doctorId,
  doctorName,
  timeZone,
}: {
  doctorId: string;
  doctorName: string;
  timeZone: string;
}) {
  const { data, isLoading, isError, error, refetch } =
    useClinicSessions(doctorId);
  const update = useUpdateClinicSession();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [stopping, setStopping] = useState<ClinicSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const today = todayInZone(timeZone);
  const sessions = data ?? [];

  const clearMessages = () => {
    setNotice(null);
    setFailure(null);
  };

  const setActive = (s: ClinicSession, active: boolean) => {
    clearMessages();
    update.mutate(
      { id: s.id, body: { isActive: active } },
      {
        onSuccess: () =>
          setNotice(
            active
              ? `${s.dayName} ${formatWallTime(s.startTime)} clinic is bookable again.`
              : `${s.dayName} ${formatWallTime(s.startTime)} clinic stopped. Reception can no longer book it.`,
          ),
        onError: (e) =>
          setFailure(apiErrorMessage(e, "Could not change the session")),
        onSettled: () => setStopping(null),
      },
    );
  };

  return (
    <Card testID="sessions-card">
      <SectionHeader
        title="Weekly clinic sessions"
        subtitle={`When ${doctorName} sees outpatients each week. Slots are cut from these.`}
        right={
          !creating ? (
            <Button
              label="Add clinic session"
              size="sm"
              fullWidth={false}
              icon={<Plus size={15} color="#FFFFFF" />}
              onPress={() => {
                clearMessages();
                setCreating(true);
              }}
              testID="session-create-open"
            />
          ) : null
        }
      />
      <VStack gap={12}>
        {failure ? (
          <View testID="session-error">
            <Banner
              tone="danger"
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}
        {notice ? (
          <View testID="session-notice">
            <Banner tone="success" message={notice} />
          </View>
        ) : null}

        {creating ? (
          <SessionCreateForm
            doctorId={doctorId}
            timeZone={timeZone}
            onCancel={() => setCreating(false)}
            onCreated={(n, days) => {
              setCreating(false);
              setNotice(
                `${plural(n, "session")} added on ${days}. Reception can book them straight away.`,
              );
            }}
          />
        ) : null}

        {isLoading ? (
          <Skeleton height={160} />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : sessions.length === 0 && !creating ? (
          <EmptyState
            icon={CalendarClock}
            title="No clinic sessions yet"
            message="Until a session is added, reception sees no free slots for this doctor."
          />
        ) : (
          <VStack gap={10}>
            {DAYS.map((day, dow) => {
              const rows = sessions.filter((s) => s.dayOfWeek === dow);
              return (
                <VStack key={day} gap={6} testID={`sessions-day-${dow}`}>
                  <Text variant="overline" tone="tertiary">
                    {day}
                  </Text>
                  {rows.length === 0 ? (
                    <Text variant="body-sm" tone="tertiary">
                      No clinic
                    </Text>
                  ) : (
                    rows.map((s) =>
                      editing === s.id ? (
                        <SessionEditForm
                          key={s.id}
                          session={s}
                          onCancel={() => setEditing(null)}
                          onSaved={() => {
                            setEditing(null);
                            setNotice(`${s.dayName} session saved.`);
                          }}
                        />
                      ) : (
                        <SessionRow
                          key={s.id}
                          session={s}
                          today={today}
                          timeZone={timeZone}
                          restarting={
                            update.isPending && update.variables?.id === s.id
                          }
                          onEdit={() => {
                            clearMessages();
                            setEditing(s.id);
                          }}
                          onStop={() => setStopping(s)}
                          onRestart={() => setActive(s, true)}
                        />
                      ),
                    )
                  )}
                </VStack>
              );
            })}
          </VStack>
        )}
      </VStack>

      <ConfirmDialog
        visible={stopping !== null}
        title="Stop this session?"
        message={
          stopping
            ? `${stopping.dayName}, ${formatWallTime(stopping.startTime)} – ${formatWallTime(stopping.endTime)}. Reception can no longer book it on any date. Appointments already booked in it are not cancelled; reception should move them.`
            : undefined
        }
        confirmLabel="Yes, stop it"
        destructive
        loading={update.isPending}
        onConfirm={() => stopping && setActive(stopping, false)}
        onCancel={() => setStopping(null)}
      />
    </Card>
  );
}

function SessionRow({
  session: s,
  today,
  timeZone,
  restarting,
  onEdit,
  onStop,
  onRestart,
}: {
  session: ClinicSession;
  today: string;
  timeZone: string;
  restarting: boolean;
  onEdit: () => void;
  onStop: () => void;
  onRestart: () => void;
}) {
  const from = calendarDateInZone(s.effectiveFrom, timeZone);
  const to = s.effectiveTo ? calendarDateInZone(s.effectiveTo, timeZone) : "";
  const ended = Boolean(to && to < today);
  const live = s.isActive && !ended;
  const key = `${s.dayOfWeek}-${s.startTime.replace(":", "")}`;

  const dates = [
    from > today ? `Starts ${shortDate(from)}` : "",
    to ? `${ended ? "Ended" : "Until"} ${shortDate(to)}` : "",
  ].filter(Boolean);

  return (
    <Card compact testID={`session-row-${key}`}>
      <HStack gap={12} align="center" wrap>
        <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
          <HStack gap={8} align="center" wrap>
            <Text variant="label-lg" tabular>
              {formatWallTime(s.startTime)} – {formatWallTime(s.endTime)}
            </Text>
            <StatusChip status={live ? "active" : "stopped"} size="sm" />
          </HStack>
          <Text variant="body-sm" tone="secondary">
            {s.slotMinutes} min slots · {plural(s.slotCapacity, "patient")} per
            slot
            {s.location ? ` · ${s.location}` : ""}
          </Text>
          {dates.length ? (
            <Text variant="caption" tone="tertiary">
              {dates.join(" · ")}
            </Text>
          ) : null}
        </VStack>
        {live ? (
          <HStack gap={6}>
            <Button
              label="Edit"
              size="xs"
              variant="secondary"
              fullWidth={false}
              accessibilityHint={`Edit the ${s.dayName} ${formatWallTime(s.startTime)} session`}
              onPress={onEdit}
              testID={`session-edit-open-${key}`}
            />
            <Button
              label="Stop this session"
              size="xs"
              variant="ghost"
              fullWidth={false}
              accessibilityHint={`Stop the ${s.dayName} ${formatWallTime(s.startTime)} session`}
              onPress={onStop}
              testID={`session-stop-${key}`}
            />
          </HStack>
        ) : !s.isActive && !ended ? (
          <Button
            label="Start again"
            size="xs"
            variant="ghost"
            fullWidth={false}
            loading={restarting}
            accessibilityHint={`Make the ${s.dayName} ${formatWallTime(s.startTime)} session bookable again`}
            onPress={onRestart}
            testID={`session-restart-${key}`}
          />
        ) : null}
      </HStack>
    </Card>
  );
}

function SessionCreateForm({
  doctorId,
  timeZone,
  onCancel,
  onCreated,
}: {
  doctorId: string;
  timeZone: string;
  onCancel: () => void;
  onCreated: (count: number, days: string) => void;
}) {
  const create = useCreateClinicSessions();
  const today = todayInZone(timeZone);
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [slotMinutes, setSlotMinutes] = useState("15");
  const [capacity, setCapacity] = useState("1");
  const [location, setLocation] = useState("");
  const [startsFrom, setStartsFrom] = useState(today);
  const [attempted, setAttempted] = useState(false);

  const times = timeErrors(start, end);
  const errors = {
    days: days.length === 0 ? "Choose at least one day" : undefined,
    start: times.start,
    end: times.end,
    slotMinutes: wholeNumber(slotMinutes, 5, 120)
      ? undefined
      : "Between 5 and 120 minutes",
    capacity: wholeNumber(capacity, 1, 20) ? undefined : "Between 1 and 20",
    location: location.trim().length > 80 ? "At most 80 characters" : undefined,
    startsFrom: !isCalendarDate(startsFrom.trim())
      ? "A date as YYYY-MM-DD"
      : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const sorted = [...days].sort();
    // Midnight on the hospital clock, not "now", so a session added today is bookable today.
    const effectiveFrom = zoneMidnight(startsFrom.trim(), timeZone);
    create.mutate(
      sorted.map((dayOfWeek) => ({
        doctorId,
        dayOfWeek,
        startTime: start.trim(),
        endTime: end.trim(),
        slotMinutes: Number(slotMinutes),
        slotCapacity: Number(capacity),
        location: location.trim() || undefined,
        effectiveFrom,
      })),
      {
        onSuccess: (rows) =>
          onCreated(
            rows.length,
            sorted.map((d) => DAYS[d].slice(0, 3)).join(", "),
          ),
      },
    );
  };

  return (
    <Card testID="session-create">
      <SectionHeader
        title="New clinic session"
        subtitle="Choose several days to add the same hours to each."
      />
      <VStack gap={12}>
        {create.isError ? (
          <View testID="session-create-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                create.error,
                "Could not add the session",
              )}
            />
          </View>
        ) : null}
        <VStack gap={4}>
          <Text variant="label" tone="secondary">
            Days
          </Text>
          <HStack gap={2} wrap role="group" accessibilityLabel="Days">
            {DAYS.map((day, dow) => (
              <View key={day} style={{ flexBasis: 120 }}>
                <ToggleRow
                  label={day}
                  checked={days.includes(dow)}
                  onChange={(on) =>
                    setDays((d) =>
                      on ? [...d, dow] : d.filter((x) => x !== dow),
                    )
                  }
                  testID={`session-create-day-${dow}`}
                />
              </View>
            ))}
          </HStack>
          {show(errors.days) ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {errors.days}
            </Text>
          ) : null}
        </VStack>
        <HStack gap={12} wrap>
          <TextField
            label="Starts at"
            required
            placeholder="09:00"
            value={start}
            onChangeText={setStart}
            maxLength={5}
            error={show(errors.start)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-create-start"
          />
          <TextField
            label="Ends at"
            required
            placeholder="13:00"
            value={end}
            onChangeText={setEnd}
            maxLength={5}
            error={show(errors.end)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-create-end"
          />
          <TextField
            label="Slot length"
            numericField
            suffix="min"
            value={slotMinutes}
            onChangeText={setSlotMinutes}
            error={show(errors.slotMinutes)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-create-slot-minutes"
          />
          <TextField
            label="Patients per slot"
            numericField
            value={capacity}
            onChangeText={setCapacity}
            error={show(errors.capacity)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-create-capacity"
          />
        </HStack>
        <HStack gap={12} wrap>
          <TextField
            label="Location"
            placeholder="OPD room 4"
            value={location}
            onChangeText={setLocation}
            error={show(errors.location)}
            containerStyle={{ flex: 2, minWidth: 220 }}
            testID="session-create-location"
          />
          <TextField
            label="Starts from"
            placeholder="YYYY-MM-DD"
            value={startsFrom}
            onChangeText={setStartsFrom}
            maxLength={10}
            error={show(errors.startsFrom)}
            hint="Today, unless the clinic begins later."
            containerStyle={{ flex: 1, minWidth: 180 }}
            testID="session-create-from"
          />
        </HStack>
        <HStack gap={8} wrap>
          <Button
            label={
              days.length > 1
                ? `Add ${days.length} sessions`
                : "Add clinic session"
            }
            fullWidth={false}
            loading={create.isPending}
            onPress={submit}
            testID="session-create-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="session-create-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

function SessionEditForm({
  session,
  onCancel,
  onSaved,
}: {
  session: ClinicSession;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateClinicSession();
  const [start, setStart] = useState(session.startTime);
  const [end, setEnd] = useState(session.endTime);
  const [slotMinutes, setSlotMinutes] = useState(String(session.slotMinutes));
  const [capacity, setCapacity] = useState(String(session.slotCapacity));
  const [location, setLocation] = useState(session.location);
  const [attempted, setAttempted] = useState(false);

  const times = timeErrors(start, end);
  const errors = {
    start: times.start,
    end: times.end,
    slotMinutes: wholeNumber(slotMinutes, 5, 120)
      ? undefined
      : "Between 5 and 120 minutes",
    capacity: wholeNumber(capacity, 1, 20) ? undefined : "Between 1 and 20",
    location: location.trim().length > 80 ? "At most 80 characters" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);
  const key = `${session.dayOfWeek}-${session.startTime.replace(":", "")}`;

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    const patch: ClinicSessionPatch = {};
    if (start.trim() !== session.startTime) patch.startTime = start.trim();
    if (end.trim() !== session.endTime) patch.endTime = end.trim();
    if (Number(slotMinutes) !== session.slotMinutes)
      patch.slotMinutes = Number(slotMinutes);
    if (Number(capacity) !== session.slotCapacity)
      patch.slotCapacity = Number(capacity);
    if (location.trim() !== session.location) patch.location = location.trim();
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    update.mutate({ id: session.id, body: patch }, { onSuccess: onSaved });
  };

  return (
    <Card testID={`session-edit-${key}`}>
      <VStack gap={12}>
        {update.isError ? (
          <View testID="session-edit-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(
                update.error,
                "Could not save the session",
              )}
            />
          </View>
        ) : null}
        <HStack gap={12} wrap>
          <TextField
            label="Starts at"
            required
            value={start}
            onChangeText={setStart}
            maxLength={5}
            error={show(errors.start)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-edit-start"
          />
          <TextField
            label="Ends at"
            required
            value={end}
            onChangeText={setEnd}
            maxLength={5}
            error={show(errors.end)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-edit-end"
          />
          <TextField
            label="Slot length"
            numericField
            suffix="min"
            value={slotMinutes}
            onChangeText={setSlotMinutes}
            error={show(errors.slotMinutes)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-edit-slot-minutes"
          />
          <TextField
            label="Patients per slot"
            numericField
            value={capacity}
            onChangeText={setCapacity}
            error={show(errors.capacity)}
            containerStyle={{ flex: 1, minWidth: 140 }}
            testID="session-edit-capacity"
          />
        </HStack>
        <TextField
          label="Location"
          value={location}
          onChangeText={setLocation}
          error={show(errors.location)}
          testID="session-edit-location"
        />
        <Text variant="caption" tone="tertiary">
          Applies to every {session.dayName} from now on. Appointments already
          booked keep their times.
        </Text>
        <HStack gap={8} wrap>
          <Button
            label="Save session"
            fullWidth={false}
            loading={update.isPending}
            onPress={submit}
            testID="session-edit-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="session-edit-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

// ---- Leave and extra clinics ------------------------------------------------

function describeException(e: ScheduleException) {
  return e.isWholeDay
    ? "Whole day"
    : `${formatWallTime(e.startTime)} – ${formatWallTime(e.endTime)}`;
}

function LeaveAndExtras({
  doctorId,
  doctorName,
  timeZone,
}: {
  doctorId: string;
  doctorName: string;
  timeZone: string;
}) {
  const today = todayInZone(timeZone);
  const { data, isLoading, isError, error, refetch } = useScheduleExceptions(
    doctorId,
    today,
  );
  const remove = useRemoveScheduleException();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<ScheduleException | null>(null);
  const [created, setCreated] = useState<CreatedScheduleException | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = data ?? [];

  const clearMessages = () => {
    setCreated(null);
    setFailure(null);
    setNotice(null);
  };

  return (
    <Card testID="exceptions-card">
      <SectionHeader
        title="Leave and extra clinics"
        subtitle="One-off changes to the weekly pattern, from today on."
        right={
          !creating ? (
            <Button
              label="Add leave or clinic"
              size="sm"
              fullWidth={false}
              icon={<Plus size={15} color="#FFFFFF" />}
              onPress={() => {
                clearMessages();
                setCreating(true);
              }}
              testID="exception-create-open"
            />
          ) : null
        }
      />
      <VStack gap={12}>
        {failure ? (
          <View testID="exception-error">
            <Banner
              tone="danger"
              message={failure}
              onDismiss={() => setFailure(null)}
            />
          </View>
        ) : null}
        {notice ? (
          <View testID="exception-notice">
            <Banner tone="success" message={notice} />
          </View>
        ) : null}
        {created ? (
          created.type !== "extra" && created.affectedAppointments > 0 ? (
            <View testID="exception-affected">
              <Banner
                tone="warning"
                title={`${plural(created.affectedAppointments, "booked patient")} on ${shortDate(created.date)}`}
                message={`${EXCEPTION_LABELS[created.type]} recorded for ${doctorName}. ${
                  created.isWholeDay
                    ? "Their appointments were not cancelled."
                    : "Appointments that day were not cancelled; some may fall outside this time."
                } Ask reception to contact the patients and move them.`}
              />
            </View>
          ) : (
            <View testID="exception-notice">
              <Banner
                tone="success"
                message={`${EXCEPTION_LABELS[created.type]} recorded for ${shortDate(created.date)}. The booking screen shows it straight away.`}
              />
            </View>
          )
        ) : null}

        {creating ? (
          <ExceptionForm
            doctorId={doctorId}
            today={today}
            onCancel={() => setCreating(false)}
            onCreated={(e) => {
              setCreating(false);
              setCreated(e);
            }}
          />
        ) : null}

        {isLoading ? (
          <Skeleton height={80} />
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="Nothing coming up"
            message="The weekly sessions apply as they are."
          />
        ) : (
          <VStack gap={8}>
            {rows.map((e) => (
              <Card key={e.id} compact testID={`exception-row-${e.date}`}>
                <HStack gap={12} align="center" wrap>
                  <VStack gap={2} style={{ flex: 1, minWidth: 220 }}>
                    <HStack gap={8} align="center" wrap>
                      <Text variant="label-lg">
                        {formatCalendarDate(e.date)}
                      </Text>
                      <StatusChip
                        status={EXCEPTION_LABELS[e.type].toLowerCase()}
                        size="sm"
                      />
                    </HStack>
                    <Text variant="body-sm" tone="secondary">
                      {describeException(e)}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </Text>
                  </VStack>
                  <Button
                    label="Remove"
                    size="xs"
                    variant="ghost"
                    fullWidth={false}
                    accessibilityHint={`Remove the ${EXCEPTION_LABELS[e.type].toLowerCase()} on ${shortDate(e.date)}`}
                    onPress={() => {
                      clearMessages();
                      setRemoving(e);
                    }}
                    testID={`exception-remove-${e.id}`}
                  />
                </HStack>
              </Card>
            ))}
          </VStack>
        )}
      </VStack>

      <ConfirmDialog
        visible={removing !== null}
        title={
          removing
            ? `Remove the ${EXCEPTION_LABELS[removing.type].toLowerCase()} on ${shortDate(removing.date)}?`
            : "Remove this entry?"
        }
        message={
          removing?.type === "extra"
            ? "Its slots stop being offered. Anyone already booked into it keeps their appointment."
            : "The weekly sessions apply again on that day, and reception can book into them."
        }
        confirmLabel="Yes, remove"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          remove.mutate(removing.id, {
            onSuccess: () =>
              setNotice(
                `Removed. ${shortDate(removing.date)} follows the weekly sessions again.`,
              ),
            onError: (err) =>
              setFailure(apiErrorMessage(err, "Could not remove the entry")),
            onSettled: () => setRemoving(null),
          })
        }
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

const TYPE_CHIPS = (
  Object.keys(EXCEPTION_LABELS) as ScheduleExceptionType[]
).map((key) => ({ key, label: EXCEPTION_LABELS[key] }));

const TYPE_HINTS: Record<ScheduleExceptionType, string> = {
  leave: "No appointments can be booked while the doctor is away.",
  blocked:
    "Part of a clinic taken up by something else, such as a theatre list.",
  extra: "A clinic outside the weekly sessions, such as a Saturday camp.",
};

function ExceptionForm({
  doctorId,
  today,
  onCancel,
  onCreated,
}: {
  doctorId: string;
  today: string;
  onCancel: () => void;
  onCreated: (e: CreatedScheduleException) => void;
}) {
  const create = useCreateScheduleException();
  const [type, setType] = useState<ScheduleExceptionType>("leave");
  const [date, setDate] = useState(today);
  const [wholeDay, setWholeDay] = useState(true);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [slotMinutes, setSlotMinutes] = useState("15");
  const [capacity, setCapacity] = useState("1");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);

  // A blocked period with no hours blocks nothing, so only leave can be whole-day.
  const needsTimes = type !== "leave" || !wholeDay;
  const times = timeErrors(start, end);
  const errors = {
    date: !isCalendarDate(date.trim())
      ? "A date as YYYY-MM-DD"
      : date.trim() < today
        ? "Today or later"
        : undefined,
    start: needsTimes ? times.start : undefined,
    end: needsTimes ? times.end : undefined,
    slotMinutes:
      type === "extra" && !wholeNumber(slotMinutes, 5, 120)
        ? "Between 5 and 120 minutes"
        : undefined,
    capacity:
      type === "extra" && !wholeNumber(capacity, 1, 20)
        ? "Between 1 and 20"
        : undefined,
    reason: reason.trim().length > 200 ? "At most 200 characters" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const show = (e?: string) => (attempted ? e : undefined);

  const submit = () => {
    setAttempted(true);
    if (!valid) return;
    create.mutate(
      {
        doctorId,
        date: date.trim(),
        type,
        ...(needsTimes ? { startTime: start.trim(), endTime: end.trim() } : {}),
        ...(type === "extra"
          ? {
              slotMinutes: Number(slotMinutes),
              slotCapacity: Number(capacity),
            }
          : {}),
        reason: reason.trim() || undefined,
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <Card testID="exception-create">
      <VStack gap={12}>
        {create.isError ? (
          <View testID="exception-create-error">
            <Banner
              tone="danger"
              message={apiErrorMessage(create.error, "Could not save this")}
            />
          </View>
        ) : null}
        <TabChips
          chips={TYPE_CHIPS}
          active={type}
          onChange={(k) => setType(k as ScheduleExceptionType)}
          testIDPrefix="exception-type"
        />
        <Text variant="caption" tone="tertiary">
          {TYPE_HINTS[type]}
        </Text>
        <HStack gap={12} wrap align="flex-start">
          <TextField
            label="Date"
            required
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            maxLength={10}
            error={show(errors.date)}
            containerStyle={{ flex: 1, minWidth: 180 }}
            testID="exception-create-date"
          />
          {type === "leave" ? (
            <View style={{ flex: 1, minWidth: 220, paddingTop: 18 }}>
              <ToggleRow
                label="Whole day"
                description="Untick for part of the day."
                checked={wholeDay}
                onChange={setWholeDay}
                testID="exception-create-whole-day"
              />
            </View>
          ) : null}
        </HStack>
        {needsTimes ? (
          <HStack gap={12} wrap>
            <TextField
              label="From"
              required
              placeholder="09:00"
              value={start}
              onChangeText={setStart}
              maxLength={5}
              error={show(errors.start)}
              containerStyle={{ flex: 1, minWidth: 140 }}
              testID="exception-create-start"
            />
            <TextField
              label="Until"
              required
              placeholder="13:00"
              value={end}
              onChangeText={setEnd}
              maxLength={5}
              error={show(errors.end)}
              containerStyle={{ flex: 1, minWidth: 140 }}
              testID="exception-create-end"
            />
            {type === "extra" ? (
              <>
                <TextField
                  label="Slot length"
                  numericField
                  suffix="min"
                  value={slotMinutes}
                  onChangeText={setSlotMinutes}
                  error={show(errors.slotMinutes)}
                  containerStyle={{ flex: 1, minWidth: 140 }}
                  testID="exception-create-slot-minutes"
                />
                <TextField
                  label="Patients per slot"
                  numericField
                  value={capacity}
                  onChangeText={setCapacity}
                  error={show(errors.capacity)}
                  containerStyle={{ flex: 1, minWidth: 140 }}
                  testID="exception-create-capacity"
                />
              </>
            ) : null}
          </HStack>
        ) : null}
        <TextField
          label="Reason"
          placeholder={
            type === "leave"
              ? "Annual leave"
              : type === "blocked"
                ? "In theatre"
                : "Diabetes camp"
          }
          value={reason}
          onChangeText={setReason}
          error={show(errors.reason)}
          hint="Reception sees this on the booking screen."
          testID="exception-create-reason"
        />
        <HStack gap={8} wrap>
          <Button
            label={`Save ${EXCEPTION_LABELS[type].toLowerCase()}`}
            fullWidth={false}
            loading={create.isPending}
            onPress={submit}
            testID="exception-create-submit"
          />
          <Button
            label="Cancel"
            variant="ghost"
            fullWidth={false}
            onPress={onCancel}
            testID="exception-create-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}

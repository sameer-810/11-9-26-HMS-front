import React, { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { palette, radius, layout, signal } from "@shared/designSystem";
import {
  Card,
  Text,
  VStack,
  HStack,
  Button,
  Select,
  TextField,
  Banner,
  ConfirmDialog,
} from "@shared/ui";
import { checkable } from "@shared/ui/a11y";
import { apiErrorMessage } from "@api/apiClient";
import {
  useNurses,
  useAssignNurse,
  useSetNews2Scale,
} from "@modules/inpatient/hooks/useInpatient";
import type { AdmissionRow } from "@modules/inpatient/types";

/** Assigned nurse and the NEWS2 scale, on the bedside chart. */
export function CareTeamCard({
  admission,
  canAssignNurse,
  canPrescribeScale,
}: {
  admission: AdmissionRow;
  /** nursing.patients.view or admission.manage, as the API allows. */
  canAssignNurse: boolean;
  /** Scale 2 is a prescribing decision. */
  canPrescribeScale: boolean;
}) {
  return (
    <Card testID="care-team">
      <VStack gap={14}>
        <Text variant="h4">Care team and scoring</Text>
        <AssignedNurse admission={admission} canAssign={canAssignNurse} />
        <View style={styles.divider} />
        <News2Scale admission={admission} canPrescribe={canPrescribeScale} />
      </VStack>
    </Card>
  );
}

function AssignedNurse({
  admission,
  canAssign,
}: {
  admission: AdmissionRow;
  canAssign: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nurseId, setNurseId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const nurses = useNurses(canAssign && open);
  const assign = useAssignNurse(admission.id);
  const current = admission.nurse;

  const options = (nurses.data ?? []).map((n) => ({
    value: n.id,
    label: n.fullName,
    sublabel: n.designation || undefined,
    disabled: n.id === current?.id,
    disabledReason: n.id === current?.id ? "Already assigned" : undefined,
  }));

  return (
    <VStack gap={8} testID="assigned-nurse">
      <HStack gap={10} align="center" justify="space-between" wrap>
        <VStack gap={2} style={{ flex: 1, minWidth: 180 }}>
          <Text variant="caption" tone="tertiary">
            Assigned nurse
          </Text>
          <Text variant="label-lg" testID="assigned-nurse-name">
            {current?.fullName ?? "Not assigned by name"}
          </Text>
          {!current ? (
            <Text variant="caption" tone="tertiary">
              Nurses allocated to this ward still see the patient on My ward.
            </Text>
          ) : null}
        </VStack>
        {canAssign && !open ? (
          <Button
            label={current ? "Change nurse" : "Assign a nurse"}
            size="sm"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              setDone(null);
              setNurseId(null);
              assign.reset();
              setOpen(true);
            }}
            testID="assign-nurse-open"
          />
        ) : null}
      </HStack>

      {done ? (
        <View testID="assign-nurse-done">
          <Banner
            tone="success"
            message={done}
            onDismiss={() => setDone(null)}
          />
        </View>
      ) : null}

      {open ? (
        <VStack gap={10} style={styles.panel} testID="assign-nurse-form">
          {nurses.isError ? (
            <Banner
              tone="danger"
              title="The list of nurses did not load"
              message={apiErrorMessage(
                nurses.error,
                "Try again in a moment. The patient stays on the ward list meanwhile.",
              )}
            />
          ) : (
            <Select
              label="Nurse"
              value={nurseId}
              options={options}
              onChange={setNurseId}
              placeholder={nurses.isLoading ? "Loading nurses…" : "Choose a nurse"}
              disabled={nurses.isLoading}
              hint="The patient appears on this nurse's My ward list straight away."
            />
          )}
          {assign.isError ? (
            <Banner
              tone="danger"
              message={apiErrorMessage(
                assign.error,
                "Could not assign the nurse. Try again.",
              )}
            />
          ) : null}
          <HStack gap={8} wrap>
            <Button
              label="Assign"
              size="sm"
              fullWidth={false}
              disabled={!nurseId}
              loading={assign.isPending}
              onPress={() =>
                assign.mutate(nurseId!, {
                  onSuccess: (row) => {
                    setOpen(false);
                    setDone(
                      `${row.nurse?.fullName ?? "The nurse"} is now the assigned nurse.`,
                    );
                  },
                })
              }
              testID="assign-nurse-submit"
            />
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              fullWidth={false}
              onPress={() => setOpen(false)}
            />
          </HStack>
        </VStack>
      ) : null}
    </VStack>
  );
}

function News2Scale({
  admission,
  canPrescribe,
}: {
  admission: AdmissionRow;
  canPrescribe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [indication, setIndication] = useState("");
  const [returning, setReturning] = useState(false);
  const setScale = useSetNews2Scale(admission.id);
  const onScale2 = admission.news2Scale === 2;
  const ready = confirmed && indication.trim().length >= 5;

  const toggle = () => setConfirmed((v) => !v);

  return (
    <VStack gap={8} testID="news2-scale">
      <HStack gap={10} align="center" justify="space-between" wrap>
        <VStack gap={2} style={{ flex: 1, minWidth: 180 }}>
          <Text variant="caption" tone="tertiary">
            NEWS2 oxygen saturation scale
          </Text>
          <Text
            variant="label-lg"
            testID="news2-scale-current"
            style={onScale2 ? { color: signal.urgent.text } : undefined}
          >
            {onScale2
              ? "Scale 2 — hypercapnic respiratory failure"
              : "Scale 1 — standard"}
          </Text>
          {onScale2 ? (
            <Text variant="caption" tone="secondary">
              Target saturation 88–92%. Saturations of 93% or more on oxygen
              score as abnormal.
            </Text>
          ) : null}
        </VStack>
        {canPrescribe && !open ? (
          onScale2 ? (
            <Button
              label="Return to Scale 1"
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={() => {
                setScale.reset();
                setReturning(true);
              }}
              testID="news2-scale-return"
            />
          ) : (
            <Button
              label="Use SpO₂ Scale 2"
              size="sm"
              variant="secondary"
              fullWidth={false}
              onPress={() => {
                setScale.reset();
                setConfirmed(false);
                setIndication("");
                setOpen(true);
              }}
              testID="news2-scale-open"
            />
          )
        ) : null}
      </HStack>

      {open ? (
        <VStack gap={10} style={styles.panel} testID="news2-scale-form">
          <Banner
            tone="warning"
            title="Only for confirmed hypercapnic respiratory failure"
            message="Scale 2 is for patients whose blood gas has shown carbon dioxide retention — usually COPD — and who have a prescribed target saturation of 88–92%. It scores those saturations as normal and a high saturation on oxygen as abnormal. Used for anyone else, it hides a falling saturation."
          />
          <TextField
            label="What confirms it?"
            required
            placeholder="ABG 14 Sep: pCO₂ 7.8 kPa on air, known COPD"
            value={indication}
            onChangeText={setIndication}
            maxLength={300}
            hint="Recorded with the change. At least 5 characters."
            testID="news2-scale-indication"
          />
          <Pressable
            onPress={toggle}
            accessibilityRole="checkbox"
            accessibilityLabel="I confirm this patient has hypercapnic respiratory failure confirmed by blood gas, with a target saturation of 88 to 92 percent"
            accessibilityState={{ checked: confirmed }}
            {...checkable(confirmed, toggle)}
            style={styles.checkRow}
            testID="news2-scale-confirm"
          >
            <View style={[styles.checkBox, confirmed ? styles.checkBoxOn : null]}>
              {confirmed ? (
                <Check size={14} color="#FFFFFF" strokeWidth={3} />
              ) : null}
            </View>
            <Text variant="body-sm" style={{ flex: 1 }}>
              I confirm hypercapnic respiratory failure is confirmed by blood
              gas, with a target saturation of 88–92%.
            </Text>
          </Pressable>
          {setScale.isError ? (
            <Banner
              tone="danger"
              message={apiErrorMessage(
                setScale.error,
                "Could not change the scale. Try again.",
              )}
            />
          ) : null}
          <HStack gap={8} wrap>
            <Button
              label="Switch to Scale 2"
              size="sm"
              fullWidth={false}
              disabled={!ready}
              loading={setScale.isPending}
              onPress={() =>
                setScale.mutate(
                  { useScale2: true, indication: indication.trim() },
                  { onSuccess: () => setOpen(false) },
                )
              }
              testID="news2-scale-submit"
            />
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              fullWidth={false}
              onPress={() => setOpen(false)}
            />
          </HStack>
        </VStack>
      ) : null}

      {returning && setScale.isError ? (
        <Banner
          tone="danger"
          message={apiErrorMessage(
            setScale.error,
            "Could not change the scale. Try again.",
          )}
        />
      ) : null}

      <ConfirmDialog
        visible={returning && !setScale.isError}
        title="Return to Scale 1?"
        message="Saturations are scored on the standard scale again from the next set of observations."
        confirmLabel="Return to Scale 1"
        loading={setScale.isPending}
        onConfirm={() =>
          setScale.mutate(
            { useScale2: false },
            { onSuccess: () => setReturning(false) },
          )
        }
        onCancel={() => setReturning(false)}
      />
    </VStack>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: palette.border.subtle,
  },
  panel: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border.subtle,
    backgroundColor: palette.surface.secondary,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: layout.minTouchTarget,
    paddingVertical: 4,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: palette.border.strong,
    backgroundColor: palette.surface.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: {
    backgroundColor: palette.clinical[600],
    borderColor: palette.clinical[600],
  },
});

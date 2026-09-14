import React, { useState } from "react";

import { Screen, VStack } from "@shared/ui";
import { TabChips } from "@modules/admin/components/TabChips";
import { HospitalProfileForm } from "@modules/admin/components/HospitalProfileForm";
import { DepartmentsPanel } from "@modules/admin/components/DepartmentsPanel";
import { WardsPanel } from "@modules/admin/components/WardsPanel";

type Tab = "hospital" | "departments" | "wards";

const TABS = [
  { key: "hospital", label: "Hospital" },
  { key: "departments", label: "Departments" },
  { key: "wards", label: "Wards & beds" },
];

/**
 * AD-01 — the hospital, its departments, and its wards, rooms and beds.
 *
 * Only the active tab is mounted. Each tab owns its queries, so opening the
 * screen to fix a phone number does not also page through every bed.
 */
export default function HospitalConfigScreen() {
  const [tab, setTab] = useState<Tab>("hospital");

  return (
    <Screen
      overline="Administration"
      title="Hospital setup"
      subtitle="Details printed on every slip, the departments people book into, and the beds they are admitted to."
      testID="config-screen"
    >
      <VStack gap={14}>
        <TabChips chips={TABS} active={tab} onChange={(k) => setTab(k as Tab)} testIDPrefix="config-tab" />
        {tab === "hospital" ? <HospitalProfileForm /> : null}
        {tab === "departments" ? <DepartmentsPanel /> : null}
        {tab === "wards" ? <WardsPanel /> : null}
      </VStack>
    </Screen>
  );
}

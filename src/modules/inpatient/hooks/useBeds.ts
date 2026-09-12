import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@api/apiClient";
import type { SelectOption } from "@shared/ui";

export interface SelectableBed {
  id: string;
  number: string;
  status: "available" | "occupied" | "reserved" | "maintenance";
  maintenanceNote: string;
  dailyCharge: number;
  features: { oxygen: boolean; ventilator: boolean; monitor: boolean };
  ward: { id: string; name: string; code: string; type: string } | null;
  room: { id: string; number: string; type: string } | null;
  selectable: boolean;
  unavailableReason: string | null;
}

const bedsApi = {
  selectable: async (params: { wardId?: string; gender?: string } = {}) => {
    const res = await apiClient.get<{ data: SelectableBed[] }>("/beds/selectable", { params });
    return res.data.data;
  },
  board: async () => {
    const res = await apiClient.get<{ data: unknown }>("/beds/board");
    return res.data.data;
  },
  wards: async () => {
    const res = await apiClient.get<{ data: { id: string; name: string; code: string; type: string }[] }>(
      "/beds/wards",
      { params: { limit: 100 } },
    );
    return res.data.data;
  },
};

export const useWards = () => useQuery({ queryKey: ["wards"], queryFn: bedsApi.wards });

export const useBedBoard = () =>
  useQuery({ queryKey: ["bed-board"], queryFn: bedsApi.board, refetchInterval: 60_000 });

/**
 * Beds as Select options.
 *
 * ---------------------------------------------------------------------------
 * Unavailable beds are SHOWN, disabled, with the reason
 * ---------------------------------------------------------------------------
 * The tempting version filters them out. That is worse: a doctor standing on
 * the ward can see bed 12, and a list where bed 12 is simply absent makes them
 * hunt for it and eventually ask someone. "Bed 12 — Occupied" answers the
 * question in the list.
 *
 * `staleTime: 0` because the answer changes as other people admit patients, and
 * a cached "available" is how two admissions race for the same bed.
 */
export const useSelectableBeds = (params: { wardId?: string; gender?: string } = {}) => {
  const query = useQuery({
    queryKey: ["selectable-beds", params],
    queryFn: () => bedsApi.selectable(params),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const data = useMemo<SelectOption[]>(
    () =>
      (query.data ?? []).map((b) => ({
        value: b.id,
        label: `${b.ward?.name ?? "Ward"} · bed ${b.number}`,
        sublabel: [
          b.room ? `room ${b.room.number}` : null,
          b.features.oxygen ? "oxygen" : null,
          b.features.ventilator ? "ventilator" : null,
          b.features.monitor ? "monitor" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        disabled: !b.selectable,
        disabledReason: b.unavailableReason ?? undefined,
      })),
    [query.data],
  );

  return { ...query, data };
};

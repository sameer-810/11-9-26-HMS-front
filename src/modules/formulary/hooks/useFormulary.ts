import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { formularyApi } from "@modules/formulary/api/formularyApi";
import type {
  FormularyParams,
  MedicineBody,
  MedicinePatch,
} from "@modules/formulary/types";

/** Prescribing search and the stock screen's medicine picker cache the formulary too. */
function afterFormularyChange(qc: QueryClient) {
  for (const key of [["formulary"], ["medicines"], ["formulary-search"]]) {
    qc.invalidateQueries({ queryKey: key });
  }
}

export const useFormulary = (params: FormularyParams) =>
  useQuery({
    queryKey: ["formulary", params],
    queryFn: () => formularyApi.list(params),
    placeholderData: (prev) => prev,
  });

export const useCreateMedicine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MedicineBody) => formularyApi.create(body),
    onSuccess: () => afterFormularyChange(qc),
  });
};

export const useUpdateMedicine = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MedicinePatch }) =>
      formularyApi.update(id, body),
    onSuccess: () => afterFormularyChange(qc),
  });
};

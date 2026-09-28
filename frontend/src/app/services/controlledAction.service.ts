import { api } from "./api";

export type ControlledActionInput = { reason: string; verificationPin: string };
export type ControlledActionResult = { id: string; action: string };

export const controlledActionService = {
  async removeInventoryItem(id: string, input: ControlledActionInput) { return (await api.delete<{data:{id:string;action:string}}>(`/inventory-items/${id}`, { data: input })).data.data; },
  async voidVariance(id: string, input: ControlledActionInput) { return (await api.post<{data:ControlledActionResult}>(`/inventory-counts/variances/${id}/void`, input)).data.data; },
  async archiveShrinkage(id: string, input: ControlledActionInput) { return (await api.post<{data:ControlledActionResult}>(`/shrinkage-reports/${id}/archive`, input)).data.data; },
  async incidentLifecycle(id: string, action: "CANCEL"|"ARCHIVE", input: ControlledActionInput) { return (await api.post<{data:ControlledActionResult}>(`/incidents/${id}/lifecycle`, {...input,action})).data.data; },
  async purchaseOrderLifecycle(id: string, action: "DELETE"|"CANCEL"|"REVERSE", input: ControlledActionInput) { return (await api.post<{data:ControlledActionResult}>(`/purchase-orders/${id}/lifecycle`, {...input,action})).data.data; },
  async deactivateBranch(id: string, input: ControlledActionInput) { return (await api.post<{data:ControlledActionResult}>(`/branches/${id}/deactivate`, input)).data.data; },
  async deletePosSource(id: string, input: ControlledActionInput) { return (await api.delete<{data:ControlledActionResult}>(`/pos-sales/sources/${id}`, { data: input })).data.data; },
};

import type { ApiSuccess } from "../types/auth";
import type { ReportDataset, ReportRequest } from "../types/reports";
import { api } from "./api";

function filename(disposition:string|undefined,fallback:string){const match=disposition?.match(/filename="?([^";]+)"?/i);return match?.[1]??fallback;}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
export const reportsService={async preview(request:ReportRequest,signal?:AbortSignal){return (await api.post<ApiSuccess<{report:ReportDataset}>>("/reports/preview",request,{signal})).data.data.report;},async export(request:ReportRequest,format:"pdf"|"xlsx"){const response=await api.post(`/reports/export/${format}`,request,{responseType:"blob"});download(response.data,filename(response.headers["content-disposition"],`Libro_Espresso_Report.${format}`));}};

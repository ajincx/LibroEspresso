export type ForecastUrgency = "HIGH" | "MEDIUM" | "LOW";

export interface ForecastAccuracySummary {
  evaluationStart: string | null;
  evaluationEnd: string | null;
  evaluatedDays: number;
  observations: {
    date: string; actualValue: number; forecastValue: number; absoluteError: number;
  }[];
  mae: number | null;
  averageActual: number | null;
  averageForecast: number | null;
  insufficientHistory: boolean;
}

export interface PredictiveForecast {
  scope: { branchId: string | null; branchName: string; forecastStart: string; forecastEnd: string };
  methodology: {
    historicalStart: string; historicalEnd: string; observedSalesDays: number;
    confidence: ForecastUrgency; insightSource: "GOOGLE_GEMINI" | "SYSTEM_ANALYSIS"; disclaimer: string;
    salesMaeMethod: string; ingredientMaeMethod: string; stockProjectionAssumption: string;
  };
  summary: {
    forecastSales: number; demandChange: number; criticalItems: number; projectedCogs: number;
    /** @deprecated Retained temporarily for API compatibility; not a visible KPI. */
    projectedShrinkageRate: number; recommendedReorders: number;
  };
  accuracy: {
    sales: {
      overall: ForecastAccuracySummary;
      branches: (ForecastAccuracySummary & { branchId: string; branchName: string })[];
    };
    ingredients: (ForecastAccuracySummary & {
      branchId: string; branchName: string; inventoryItemId: string; name: string; unit: string;
      incompatibleUnits: boolean;
    })[];
  };
  demandSeries: { date: string; label: string; actualSales?: number; projectedSales?: number }[];
  inventorySeries: { date: string; label: string; values: { key: string; name: string; unit: string; value: number }[] }[];
  inventoryChartItems: { key: string; name: string; unit: string }[];
  predictions: {
    branchId: string; branchName: string; inventoryItemId: string; sku: string; name: string; unit: string;
    systemStock: number; dailyUsage: number; outstandingQuantity: number; daysToStockout: number | null;
    nextDeliveryDate: string | null;
    projectedEndStock: number; recommendedReorder: number; urgency: ForecastUrgency;
  }[];
  insights: { title: string; description: string; recommendation: string; urgency: ForecastUrgency }[];
}

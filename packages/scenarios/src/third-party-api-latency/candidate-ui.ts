import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  API_TIMEOUT_MS_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
} from "./controls";

export const thirdPartyApiLatencyCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "checkoutServiceThreadPoolUtilization",
      label: "Checkout Thread Pool Utilization",
      sourceStateKey: "checkoutServiceThreadPoolUtilization",
      format: "percentage",
    },
    {
      key: "thirdPartyResponseTimeMs",
      label: "Vendor Response Time",
      sourceStateKey: "thirdPartyResponseTimeMs",
      format: "duration",
    },
    {
      key: "checkoutAbandonmentRate",
      label: "Checkout Abandonment Rate",
      sourceStateKey: "checkoutAbandonmentRate",
      format: "percentage",
    },
    {
      key: "cacheFallbackHitRate",
      label: "Cache Fallback Hit Rate",
      sourceStateKey: "cacheFallbackHitRate",
      format: "percentage",
    },
    { key: "checkoutStatus", label: "Checkout Status", sourceStateKey: "checkoutStatus", format: "status" },
  ],
  controls: [
    {
      key: API_TIMEOUT_MS_KEY,
      label: "Vendor API Timeout",
      componentId: "integration-adapter",
      valueLabels: { "500": "500ms", "2000": "2s", "8000": "8s", "20000": "20s" },
    },
    {
      key: CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
      label: "Cached Response Fallback",
      componentId: "response-cache",
      valueLabels: { false: "Off", true: "On" },
    },
    {
      key: ASYNC_PROCESSING_ENABLED_KEY,
      label: "Async Processing",
      componentId: "checkout-service",
      valueLabels: { false: "Off (synchronous)", true: "On (async)" },
    },
  ],
  components: [
    { id: "checkout-service", label: "Checkout Service" },
    { id: "integration-adapter", label: "Integration Adapter" },
    { id: "response-cache", label: "Response Cache" },
    { id: "shipping-rate-api", label: "Shipping Rate API (External)" },
  ],
};

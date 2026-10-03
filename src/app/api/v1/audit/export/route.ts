import { unavailableResponse } from "@/shared/gateway/unavailable";

// Static segment beats audit/[id], so audit_export keeps its 503 seam instead of a 400 (T08 backend).
export const GET = () => unavailableResponse();

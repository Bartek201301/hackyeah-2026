import { unavailableResponse } from "@/shared/gateway/unavailable";

// Seam: every /api/v1 operation is unavailable until a real route (T03+) takes precedence.
// GET handlers are dynamic by default since Next 15, so nothing is statically cached.
const unavailable = () => unavailableResponse();

export { unavailable as GET, unavailable as POST, unavailable as PUT, unavailable as DELETE };

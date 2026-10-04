import { errorOutcome } from "@/shared/gateway/envelope";
import { handle, isUuid } from "@/shared/gateway/http";
import { readReview } from "@/shared/gateway/reviews";
import { unavailableResponse } from "@/shared/gateway/unavailable";
import { gatewayDeps } from "../../composition";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/reviews/[id]">) {
  const { id } = await ctx.params;
  return handle(request, {}, async ({ actor }) =>
    isUuid(id) ? readReview(gatewayDeps(), actor, id) : errorOutcome("INVALID_INPUT"),
  );
}

// review_resolve (PUT) is P11's, not this slice's: it stays the 503 seam, which is a withheld
// operation rather than a method error. ReviewPanel already calls it and reads that envelope.
const unavailable = () => unavailableResponse();
export { unavailable as PUT, unavailable as POST, unavailable as DELETE };

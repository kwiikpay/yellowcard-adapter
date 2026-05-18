import { describe, it, expect } from "vitest";
import { classifyYcStatus } from "../../src/webhook/classify.js";

describe("classifyYcStatus", () => {
  describe("inbound flow", () => {
    it.each(["completed", "complete", "success", "processed", "settled"])(
      "classifies '%s' as completed",
      (status) => {
        expect(classifyYcStatus(status, "inbound")).toBe("completed");
      },
    );

    it.each(["received", "paid", "collected", "processing"])(
      "classifies '%s' as received",
      (status) => {
        expect(classifyYcStatus(status, "inbound")).toBe("received");
      },
    );

    it.each(["failed", "rejected", "cancelled", "expired"])(
      "classifies '%s' as failed",
      (status) => {
        expect(classifyYcStatus(status, "inbound")).toBe("failed");
      },
    );

    it("classifies unknown statuses as 'tick'", () => {
      expect(classifyYcStatus("pending_review", "inbound")).toBe("tick");
      expect(classifyYcStatus("", "inbound")).toBe("tick");
    });
  });

  describe("outbound flow", () => {
    it.each(["completed", "complete", "success", "processed", "settled", "paid"])(
      "classifies '%s' as completed",
      (status) => {
        expect(classifyYcStatus(status, "outbound")).toBe("completed");
      },
    );

    it.each(["sent", "processing", "submitted"])(
      "classifies '%s' as sent",
      (status) => {
        expect(classifyYcStatus(status, "outbound")).toBe("sent");
      },
    );

    it.each(["failed", "rejected", "cancelled", "expired"])(
      "classifies '%s' as failed",
      (status) => {
        expect(classifyYcStatus(status, "outbound")).toBe("failed");
      },
    );

    it("'paid' is completed for outbound but received for inbound", () => {
      expect(classifyYcStatus("paid", "outbound")).toBe("completed");
      expect(classifyYcStatus("paid", "inbound")).toBe("received");
    });
  });

  it("is case-insensitive", () => {
    expect(classifyYcStatus("COMPLETED", "outbound")).toBe("completed");
    expect(classifyYcStatus("Failed", "inbound")).toBe("failed");
  });
});

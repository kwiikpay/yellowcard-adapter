/**
 * Reference: a Supabase Edge Function that uses
 * @kwiikpay/yellowcard-adapter for the outbound (send-money) flow.
 *
 * Compare against `kwiikpay/website-kp:thor/supabase/functions/
 * yellowcard-outbound-create/index.ts` (which has the YC API logic
 * inlined). This version is ~80 lines shorter because the YC-specific
 * code (HMAC sign + payload construction) lives in the package.
 *
 * What stays in the EF:
 *   - Supabase auth + JWT verification
 *   - Ledger debit/credit RPCs
 *   - Order-row insert + status_history append
 *   - Auto-refund policy on YC rejection
 *   - Failure handling & response shape
 *
 * What's in the package:
 *   - HMAC signing + ycFetch
 *   - The bug-fix-laden payload construction
 *   - KYC normalisation
 *
 * Bolt cannot touch the package (it lives in node_modules), so the
 * 10 historical bug fixes are safe from auto-reverts. The EF itself
 * is still subject to Bolt edits, but the surface that Bolt could
 * regress is small and clearly bounded.
 */

// @ts-ignore — Deno-specific imports
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ycFetch,
  buildOutboundPaymentPayload,
  normalizeKycFromUserMetadata,
  YC_SANDBOX_URL,
} from "npm:@kwiikpay/yellowcard-adapter@^0.1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // ── Auth ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: serviceRoleKey,
      },
    });
    if (!userRes.ok) return json({ error: "Unauthorized" }, 401);
    const user = await userRes.json();

    // ── Body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { quote, beneficiary } = body;
    if (!quote || !beneficiary) {
      return json({ error: "quote and beneficiary required" }, 400);
    }
    if (new Date(quote.quote_expires_at).getTime() < Date.now()) {
      return json({ error: "Quote expired" }, 400);
    }

    // ── Order row + ledger debit ────────────────────────────────────
    const { data: orderRow, error: insErr } = await sb
      .from("yellowcard_outbound_orders")
      .insert({
        user_id: user.id,
        source_currency: "USDT",
        source_amount: quote.source_amount,
        destination_country: quote.destination_country,
        destination_currency: quote.destination_currency,
        destination_amount: quote.destination_amount,
        quoted_rate: quote.quoted_rate,
        quote_expires_at: quote.quote_expires_at,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr || !orderRow) {
      return json({ error: `Failed to create order: ${insErr?.message}` }, 500);
    }
    const orderId = orderRow.id as string;

    const { error: debitErr } = await sb.rpc("debit_user_asset", {
      p_user_id: user.id,
      p_currency: "USDT",
      p_amount: quote.source_amount,
      p_reason: "yellowcard_outbound",
      p_ref_type: "yellowcard_outbound_order",
      p_ref_id: orderId,
    });
    if (debitErr) {
      await sb.from("yellowcard_outbound_orders").update({
        status: "failed",
        failure_reason: debitErr.message,
      }).eq("id", orderId);
      return json({ error: debitErr.message }, 400);
    }

    // ── Build YC payload + call (PACKAGE) ──────────────────────────
    const { data: config } = await sb
      .from("yellowcard_config")
      .select("base_url, business_name, business_id")
      .eq("id", 1)
      .maybeSingle();

    const kyc = normalizeKycFromUserMetadata(
      user.user_metadata,
      user.email ?? "",
    );

    // CUSTOMISE: change prefix to match this project. `kp-` for retail
    // (website-kp), `kpb-` for business (kwiikpay-dashboard).
    const sequenceId = `kpb-${orderId}`;

    const payload = buildOutboundPaymentPayload({
      sequenceId,
      beneficiary: {
        channelId: beneficiary.channel_id,
        networkId: beneficiary.network_id,
        accountName: beneficiary.account_name,
        accountNumber: beneficiary.account_number,
        bankCode: beneficiary.bank_code,
        phoneNumber: beneficiary.phone_number,
        recipientEmail: beneficiary.recipient_email,
      },
      destinationCurrency: quote.destination_currency,
      destinationCountry: quote.destination_country,
      localAmount: quote.destination_amount,
      business: {
        businessName: config?.business_name ?? "Kwiikpay",
        businessId: config?.business_id ?? "kwiikpay-business",
      },
      customer: kyc,
    });

    const result = await ycFetch(
      {
        baseUrl: config?.base_url ?? YC_SANDBOX_URL,
        apiKey: Deno.env.get("YELLOWCARD_API_KEY2")!.trim(),
        secretKey: Deno.env.get("YELLOWCARD_SECRET_KEY2")!.trim(),
      },
      { path: "/payments", method: "POST", body: payload },
    );

    // ── Handle result ──────────────────────────────────────────────
    if (!result.ok) {
      // Auto-refund the debit since YC rejected the payment
      const { data: feeSettings } = await sb
        .from("yellowcard_fee_settings")
        .select("auto_refund_on_failure")
        .eq("id", 1)
        .maybeSingle();
      const autoRefund = feeSettings?.auto_refund_on_failure ?? true;

      if (autoRefund) {
        await sb.rpc("credit_user_asset", {
          p_user_id: user.id,
          p_currency: "USDT",
          p_amount: quote.source_amount,
          p_reason: "yellowcard_refund",
          p_ref_type: "yellowcard_outbound_order",
          p_ref_id: orderId,
          p_memo: `Auto-refund: YC rejected (${result.status})`,
        });
      }

      const errText = typeof (result.data as { message?: string })?.message === "string"
        ? (result.data as { message: string }).message
        : JSON.stringify(result.data).slice(0, 500);

      await sb.from("yellowcard_outbound_orders").update({
        status: autoRefund ? "refunded" : "failed",
        failure_reason: `YC ${result.status}: ${errText}`,
        yc_last_response: result.data,
      }).eq("id", orderId);

      return json({
        error: `Yellow Card rejected the payment: ${errText}`,
        order_id: orderId,
      }, 400);
    }

    // ── Success: record YC IDs ─────────────────────────────────────
    const ycData = result.data as Record<string, unknown>;
    const ycOrderId = String(ycData.id ?? ycData.paymentId ?? "");
    const ycStatus = String(ycData.status ?? "");

    await sb.from("yellowcard_outbound_orders").update({
      yc_order_id: ycOrderId,
      yc_sequence_id: sequenceId,
      yc_status: ycStatus,
      yc_last_response: ycData,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    }).eq("id", orderId);

    return json({
      order_id: orderId,
      yc_order_id: ycOrderId,
      yc_status: ycStatus,
    });
  } catch (err) {
    console.error("yellowcard-outbound-create error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      500,
    );
  }
});

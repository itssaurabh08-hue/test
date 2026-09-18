# Meta WhatsApp Cloud API setup guide

This guide walks through connecting a real WhatsApp Business Account (WABA)
to this application. It only covers the Meta-side configuration — for
running the app itself, see the main [README.md](../README.md).

> **A note on how this guide was verified.** The development sandbox this
> project was built in has outbound network access to `developers.facebook.com`
> and `graph.facebook.com` blocked by its network policy, so the exact
> Graph API version and the finer webhook payload details below were
> verified via web search summaries of Meta's own documentation and
> third-party sources that quote it directly, **not** by fetching Meta's
> pages directly. The core concepts (App Dashboard → WhatsApp product →
> API Setup, System Users, permanent tokens, webhook verify tokens,
> X-Hub-Signature-256) are stable, long-standing parts of the Meta
> developer platform and are used correctly here. Two things you should
> re-verify yourself against the live Meta for Developers site before a
> production launch, because they change over time:
>
> 1. **The current Graph API version** — this app defaults
>    `META_GRAPH_API_VERSION` to `v26.0` (current as of September 2026,
>    per <https://developers.facebook.com/docs/graph-api/changelog> and
>    Meta's own July 2026 "Introducing Graph API v26.0" announcement).
>    Meta ships a new version roughly every few months and retires old
>    ones about two years after release — check
>    <https://developers.facebook.com/docs/graph-api/changelog> and
>    update the env var if it's moved on.
> 2. **Exact menu/button labels in the App Dashboard** — Meta reorganises
>    this UI periodically. Where this guide names a specific label, treat
>    it as "the option that does X" rather than a pixel-perfect map; the
>    underlying capability (get a token, add a phone number, configure a
>    webhook) has stayed the same for years even as the surrounding menu
>    has moved.

## 1. Prerequisites

- A Meta Business Account (business.facebook.com).
- A phone number you can receive SMS/voice calls on, not already
  registered to a personal WhatsApp or WhatsApp Business app, to use as
  your sending number (Meta also provides a free test number for
  development — see step 4).
- Admin access to a Meta App in the App Dashboard
  (developers.facebook.com), or permission to create one.

## 2. Create a Meta App

1. Go to the Meta App Dashboard and create a new app.
2. Choose the **Business** app type.
3. Associate it with your Meta Business Account.

## 3. Add the WhatsApp product

1. From the app's dashboard, add the **WhatsApp** product to the app.
2. This provisions a WhatsApp Business Account (WABA) linked to the app
   if you don't already have one, and takes you to WhatsApp's **API
   Setup** (or equivalently named) screen, which is the fastest place to
   find the IDs and a short-lived token for initial testing.

## 4. Get your Phone Number ID and WABA ID

On the WhatsApp API Setup screen:

- Meta provides a **free test phone number** for development, already
  associated with a **Phone Number ID** — copy this into
  `META_PHONE_NUMBER_ID`.
- The **WhatsApp Business Account ID** shown on the same screen goes into
  `META_WABA_ID`.
- The test number can only message phone numbers you've explicitly added
  as recipients on that same screen (up to a small limit) until you move
  to a real, verified sending number — see step 10.

## 5. Get an access token

For initial testing, the API Setup screen provides a **temporary access
token** (valid ~24 hours) — usable for local development but not for a
running app.

For anything beyond ad-hoc testing:

1. In Business Settings, create (or reuse) a **System User** with admin
   access to the app.
2. Generate a **permanent access token** for that System User, scoped to
   the `whatsapp_business_messaging` and `whatsapp_business_management`
   permissions.
3. Put this token in `META_ACCESS_TOKEN`. Treat it exactly like a
   password — it's the credential this whole app uses to send messages
   on your behalf.

## 6. Get your App Secret

In the app's Basic Settings, reveal and copy the **App Secret** into
`META_APP_SECRET`. This is used to verify that incoming webhook requests
really came from Meta (HMAC-SHA256 signature check) — see
`lib/meta/webhookParsing.ts`.

## 7. Set the environment variables

Fill in `.env` (copied from `.env.example`):

```bash
META_ACCESS_TOKEN="<permanent system user token>"
META_WABA_ID="<your WABA id>"
META_PHONE_NUMBER_ID="<your phone number id>"
META_APP_ID="<your app id>"
META_APP_SECRET="<your app secret>"
META_VERIFY_TOKEN="<a random string you choose yourself>"
META_GRAPH_API_VERSION="v26.0"
WHATSAPP_MOCK_MODE="false"
```

`META_VERIFY_TOKEN` is **not** issued by Meta — you invent this string
yourself and enter the same value in both `.env` and the webhook
configuration in step 8. It's just a shared secret so Meta's
verification handshake can confirm your endpoint is the one you
registered.

## 8. Configure the webhook

1. In the app's WhatsApp product settings, find **Configuration** (or
   the equivalent webhooks section) and set the **Callback URL** to:

   ```
   https://<your-deployed-domain>/api/webhooks/meta/whatsapp
   ```

   (For local development, use a tunnel such as `ngrok http 3000` and
   point the callback URL at the resulting HTTPS URL — Meta requires
   HTTPS and cannot reach `localhost` directly.)

2. Set the **Verify Token** field to the same value as `META_VERIFY_TOKEN`
   in your `.env`.
3. Meta will call `GET /api/webhooks/meta/whatsapp` with `hub.mode`,
   `hub.verify_token`, and `hub.challenge` query parameters; this app's
   route handler (`app/api/webhooks/meta/whatsapp/route.ts`) checks the
   token and echoes the challenge back, which is what "verifies" the
   webhook in the Meta UI.
4. Subscribe the webhook to the **messages** field (this is what
   delivers both message-status updates — sent/delivered/read/failed —
   and inbound user messages, used here for opt-out keyword detection).

## 9. Create and get a message template approved

Business-initiated messages (the bulk campaigns this app sends) must use
a pre-approved template.

1. In WhatsApp Manager (business.facebook.com → WhatsApp Manager, or
   linked from the app's WhatsApp product), go to **Message Templates**
   and create a new template.
2. Choose a category (Marketing, Utility, or Authentication — this
   affects both Meta's review process and its pricing).
3. Write the template body, using `{{1}}`, `{{2}}`, etc. for variables
   you'll fill in per recipient (name, event, date, ...). Provide the
   example values Meta asks for — these are required for the template to
   be submitted.
4. Submit for review. Approval is usually fast but not instant, and Meta
   can reject templates that look like spam, contain ads-style urgency
   language, or don't match the stated category.
5. Once **Approved**, it becomes available to this app after you click
   **Sync from Meta** on the Templates page (`/templates`), which calls
   the `message_templates` edge (`lib/meta/metaTemplates.ts`) and caches
   the result. Only `APPROVED` templates can be used to start a campaign.

## 10. Moving from the test number to a production number

The free test number is for development only: it can't message arbitrary
recipients and is rate-limited. For production:

1. Add your real business phone number under the WhatsApp product's
   phone numbers section and verify it (Meta sends an SMS/voice OTP).
2. Complete **Meta Business verification** for your Business Account —
   required before you can message the general public at any real volume
   and before higher messaging-limit tiers unlock.
3. Update `META_PHONE_NUMBER_ID` to the new number's ID.

## 11. Messaging limits and rate limits

Meta enforces:

- **Messaging tier limits** — how many *unique customers* you can
  message in a rolling 24 hours, which starts low (e.g. a few hundred)
  for new numbers and increases automatically based on quality rating
  and volume over time. This is separate from and in addition to this
  app's own configurable throughput limiter
  (`MAX_MESSAGES_PER_SECOND` / `MAX_CONCURRENT_JOBS` in `.env`) — the
  app's limiter controls *how fast* you send; Meta's tier controls *how
  many distinct people* you can reach per day.
- **Throughput/rate limiting per phone number**, returned as an API
  error (see `lib/meta/errorClassification.ts` for how this app
  classifies and backs off on those errors — codes like `4`, `80007`,
  `131048` are treated as transient and retried with exponential
  backoff, never aggressively re-sent).

Because these thresholds and exact numbers are tier-based and change with
Meta's own policy, don't hardcode assumptions about them anywhere in this
codebase — check your WABA's current limits in WhatsApp Manager.

## 12. Testing your setup

1. Set `WHATSAPP_MOCK_MODE="false"` once the above is done.
2. Go to `/templates` and click **Sync from Meta** — you should see your
   approved template(s).
3. Go to `/contacts/import`, import a small CSV containing your own
   phone number.
4. Go to `/campaigns/new`, pick the template, select your contact, map
   variables, and create the campaign.
5. Start the campaign from the campaign detail page and confirm you
   receive the WhatsApp message.
6. Confirm the campaign detail page's recipient row progresses from
   `SENT` to `DELIVERED` to `READ` as Meta's webhook calls arrive — this
   confirms both the webhook URL and the signature verification are
   correctly configured end to end.

## Official documentation referenced

- Graph API changelog / versioning:
  <https://developers.facebook.com/docs/graph-api/changelog>
- WhatsApp Cloud API webhooks setup guide:
  <https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/>
- WhatsApp Cloud API webhook payload examples:
  <https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples/>
- WhatsApp Business Platform overview:
  <https://developers.facebook.com/documentation/business-messaging/whatsapp/overview>

As noted at the top of this document, these URLs were not directly
fetched during development (blocked by this sandbox's network policy) —
confirm the content at these links matches what's described here before
relying on it for a production integration.
